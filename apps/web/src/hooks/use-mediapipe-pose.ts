/**
 * useMediaPipePose — Client-side 2D Pose Estimation Hook
 *
 * Wraps MediaPipe Pose (via @mediapipe/tasks-vision) for real-time
 * skeletal tracking during swing video recording.
 *
 * Limitations (2D only):
 *  - No X-Factor or hip rotation precision
 *  - Accuracy degrades with poor lighting or partial body visibility
 *
 * @module hooks/use-mediapipe-pose
 * @feature F-005
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '@/lib/utils/logger';
import type { Keypoint, JointAngles } from '@hellonext/shared/types/pose';

interface PoseFrameWithAngles {
  frame_index: number;
  timestamp_ms: number;
  keypoints: Array<Keypoint & { name: string }>;
  angles: JointAngles;
}

type PoseStatus = 'loading' | 'ready' | 'error' | 'no-permission';

interface UsePoseResult {
  status: PoseStatus;
  frames: PoseFrameWithAngles[];
  error: string | null;
  initModel: () => Promise<void>;
  processVideoFrame: (video: HTMLVideoElement, frameIndex: number, timestampMs: number) => void;
  resetFrames: () => void;
}

// MediaPipe landmark names mapped to our keypoint naming convention
const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
] as const;

// Keypoints essential for golf swing analysis
const GOLF_KEYPOINTS = new Set([
  'nose', 'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
]);

// Confidence threshold for keypoint visibility
const CONFIDENCE_THRESHOLD = 0.5;

// Frame rate throttling: ~30fps = 33ms
const FRAME_SAMPLE_INTERVAL_MS = 33;

/**
 * Calculate angle between three points (A-B-C) in radians.
 * @param a First point {x, y}
 * @param b Center point {x, y}
 * @param c Third point {x, y}
 * @returns Angle in radians
 */
function calculateAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const vec1 = { x: a.x - b.x, y: a.y - b.y };
  const vec2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = vec1.x * vec2.x + vec1.y * vec2.y;
  const mag1 = Math.sqrt(vec1.x ** 2 + vec1.y ** 2);
  const mag2 = Math.sqrt(vec2.x ** 2 + vec2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = dot / (mag1 * mag2);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/**
 * Convert radians to degrees
 */
function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function useMediaPipePose(): UsePoseResult {
  const [status, setStatus] = useState<PoseStatus>('loading');
  const [frames, setFrames] = useState<PoseFrameWithAngles[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastFrameTimestamp, setLastFrameTimestamp] = useState(0);

  const poseLandmarkerRef = useRef<unknown>(null);
  const canvasRef = useRef<OffscreenCanvas | null>(null);

  const initModel = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);

      // Dynamically import MediaPipe Tasks Vision
      const vision = await import('@mediapipe/tasks-vision');
      const { PoseLandmarker, FilesetResolver } = vision;

      if (!vision || !PoseLandmarker || !FilesetResolver) {
        throw new Error('MediaPipe modules not available');
      }

      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      const landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      poseLandmarkerRef.current = landmarker;
      canvasRef.current = new OffscreenCanvas(640, 480);
      setStatus('ready');
      logger.info('MediaPipe Pose model loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MediaPipe 모델 로딩 실패';
      setError(message);
      setStatus('error');
      logger.error('MediaPipe init failed', { error: err });
    }
  }, []);

  const processVideoFrame = useCallback(
    (video: HTMLVideoElement, frameIndex: number, timestampMs: number) => {
      const landmarker = poseLandmarkerRef.current as {
        detectForVideo: (
          video: HTMLVideoElement,
          timestamp: number
        ) => { landmarks: { x: number; y: number; z: number; visibility: number }[][] };
      } | null;

      if (!landmarker) return;

      // Frame rate throttling: skip frame if too soon after last processed frame
      if (timestampMs - lastFrameTimestamp < FRAME_SAMPLE_INTERVAL_MS) {
        return;
      }

      try {
        const result = landmarker.detectForVideo(video, timestampMs);

        if (result.landmarks && result.landmarks.length > 0) {
          const landmarks = result.landmarks[0]!;

          // Extract all keypoints
          const allKeypoints = landmarks.map((lm, idx) => ({
            name: LANDMARK_NAMES[idx] ?? `point_${idx}`,
            x: lm.x,
            y: lm.y,
            visibility: lm.visibility ?? 0,
          }));

          // Filter golf-relevant keypoints and apply confidence threshold
          const keypoints = allKeypoints
            .filter((kp) => GOLF_KEYPOINTS.has(kp.name) && kp.visibility > CONFIDENCE_THRESHOLD);

          // Validate: need minimum keypoints for analysis
          if (keypoints.length < 8) {
            // Not enough body visible — skip frame but don't error
            return;
          }

          // Build a map for angle calculations
          const keypointMap = new Map(allKeypoints.map((kp) => [kp.name, kp]));

          // Compute joint angles
          const leftShoulder = calculateAngle(
            keypointMap.get('left_elbow') ?? { x: 0, y: 0 },
            keypointMap.get('left_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('left_hip') ?? { x: 0, y: 0 }
          );

          const rightShoulder = calculateAngle(
            keypointMap.get('right_elbow') ?? { x: 0, y: 0 },
            keypointMap.get('right_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('right_hip') ?? { x: 0, y: 0 }
          );

          const leftElbow = calculateAngle(
            keypointMap.get('left_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('left_elbow') ?? { x: 0, y: 0 },
            keypointMap.get('left_wrist') ?? { x: 0, y: 0 }
          );

          const rightElbow = calculateAngle(
            keypointMap.get('right_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('right_elbow') ?? { x: 0, y: 0 },
            keypointMap.get('right_wrist') ?? { x: 0, y: 0 }
          );

          const leftHip = calculateAngle(
            keypointMap.get('left_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('left_hip') ?? { x: 0, y: 0 },
            keypointMap.get('left_knee') ?? { x: 0, y: 0 }
          );

          const rightHip = calculateAngle(
            keypointMap.get('right_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('right_hip') ?? { x: 0, y: 0 },
            keypointMap.get('right_knee') ?? { x: 0, y: 0 }
          );

          const leftKnee = calculateAngle(
            keypointMap.get('left_hip') ?? { x: 0, y: 0 },
            keypointMap.get('left_knee') ?? { x: 0, y: 0 },
            keypointMap.get('left_ankle') ?? { x: 0, y: 0 }
          );

          const rightKnee = calculateAngle(
            keypointMap.get('right_hip') ?? { x: 0, y: 0 },
            keypointMap.get('right_knee') ?? { x: 0, y: 0 },
            keypointMap.get('right_ankle') ?? { x: 0, y: 0 }
          );

          const spine = calculateAngle(
            keypointMap.get('left_shoulder') ?? { x: 0, y: 0 },
            keypointMap.get('nose') ?? { x: 0, y: 0 },
            keypointMap.get('left_hip') ?? { x: 0, y: 0 }
          );

          const angles: JointAngles = {
            leftShoulder: radiansToDegrees(leftShoulder),
            rightShoulder: radiansToDegrees(rightShoulder),
            leftElbow: radiansToDegrees(leftElbow),
            rightElbow: radiansToDegrees(rightElbow),
            leftHip: radiansToDegrees(leftHip),
            rightHip: radiansToDegrees(rightHip),
            leftKnee: radiansToDegrees(leftKnee),
            rightKnee: radiansToDegrees(rightKnee),
            spine: radiansToDegrees(spine),
          };

          const frame: PoseFrameWithAngles = {
            frame_index: frameIndex,
            timestamp_ms: timestampMs,
            keypoints: keypoints as Array<Keypoint & { name: string }>,
            angles,
          };

          setFrames((prev) => [...prev, frame]);
          setLastFrameTimestamp(timestampMs);
        }
      } catch (err) {
        logger.error('Pose detection frame error', { frameIndex, error: err });
      }
    },
    [lastFrameTimestamp]
  );

  const resetFrames = useCallback(() => {
    setFrames([]);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      const landmarker = poseLandmarkerRef.current as { close?: () => void } | null;
      if (landmarker?.close) {
        landmarker.close();
      }
    };
  }, []);

  return {
    status,
    frames,
    error,
    initModel,
    processVideoFrame,
    resetFrames,
  };
}
