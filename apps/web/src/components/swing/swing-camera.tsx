/**
 * SwingCamera Component
 *
 * Full-screen camera view for recording golf swings.
 * Integrates MediaPipe real-time pose overlay during recording.
 * Max 60 seconds. Outputs video blob + pose frames.
 *
 * @module components/swing/swing-camera
 * @feature F-005
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMediaPipePose } from '@/hooks/use-mediapipe-pose';
import { formatDuration } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

const MAX_VIDEO_DURATION_SEC = 60;
const POSE_SAMPLE_INTERVAL_MS = 33; // ~30fps

interface SwingCameraProps {
  onRecordingComplete: (videoBlob: Blob, poseFrames: PoseFrame[], durationSec: number) => void;
  onCancel: () => void;
}

interface PoseFrame {
  frame_index: number;
  timestamp_ms: number;
  keypoints: { name: string; x: number; y: number; visibility: number }[];
  angles: {
    leftShoulder: number;
    rightShoulder: number;
    leftElbow: number;
    rightElbow: number;
    leftHip: number;
    rightHip: number;
    leftKnee: number;
    rightKnee: number;
    spine: number;
  };
}

type CameraState = 'initializing' | 'ready' | 'recording' | 'stopped' | 'error';

export function SwingCamera({ onRecordingComplete, onCancel }: SwingCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const poseIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const frameCountRef = useRef(0);
  const startTimeRef = useRef(0);

  const [cameraState, setCameraState] = useState<CameraState>('initializing');
  const [duration, setDuration] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const recordingMimeTypeRef = useRef<string>('video/webm');

  const {
    status: poseStatus,
    frames: poseFrames,
    error: poseError,
    initModel,
    processVideoFrame,
    resetFrames,
  } = useMediaPipePose();

  // Initialize camera + MediaPipe
  useEffect(() => {
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        // Request camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Rear camera preferred for swing recording
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Init MediaPipe model
        await initModel();
        setCameraState('ready');
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'NotAllowedError'
            ? '카메라 접근 권한이 필요합니다. 설정에서 카메라를 허용해주세요.'
            : err instanceof Error && err.name === 'NotFoundError'
              ? '카메라를 찾을 수 없습니다.'
              : '카메라 초기화에 실패했습니다.';

        setCameraError(message);
        setCameraState('error');
        logger.error('Camera init failed', { error: err });
      }
    };

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (poseIntervalRef.current) clearInterval(poseIntervalRef.current);
    };
  }, [initModel]);

  // Start recording
  const handleStart = useCallback(() => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject as MediaStream;
    chunksRef.current = [];
    frameCountRef.current = 0;
    resetFrames();

    // Detect supported MIME type for video recording
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

    recordingMimeTypeRef.current = mimeType;

    const recorder = new MediaRecorder(stream, {
      mimeType,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const videoBlob = new Blob(chunksRef.current, { type: recordingMimeTypeRef.current });
      onRecordingComplete(videoBlob, poseFrames, duration);
    };

    recorder.start(100); // 100ms chunks
    mediaRecorderRef.current = recorder;
    startTimeRef.current = performance.now();

    // Duration timer
    timerRef.current = setInterval(() => {
      setDuration((prev) => {
        if (prev >= MAX_VIDEO_DURATION_SEC) {
          handleStop();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    // Pose estimation at ~30fps (if model is ready)
    if (poseStatus === 'ready') {
      poseIntervalRef.current = setInterval(() => {
        if (videoRef.current) {
          const elapsed = performance.now() - startTimeRef.current;
          processVideoFrame(videoRef.current, frameCountRef.current++, elapsed);
        }
      }, POSE_SAMPLE_INTERVAL_MS);
    }

    setCameraState('recording');
    logger.info('Swing recording started');
  }, [poseStatus, poseFrames, duration, onRecordingComplete, processVideoFrame, resetFrames]);

  // Stop recording
  const handleStop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (poseIntervalRef.current) clearInterval(poseIntervalRef.current);

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    setCameraState('stopped');
    logger.info('Swing recording stopped', { duration, poseFrames: poseFrames.length });
  }, [duration, poseFrames.length]);

  return (
    <div className="fixed inset-0 z-50 bg-night flex flex-col">
      {/* Camera Preview */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-[0.12]"
          playsInline
          muted
          autoPlay
        />

        {/* Pose overlay guide */}
        {cameraState === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-2 border-dashed border-bone rounded-lg w-3/4 h-4/5 flex items-end justify-center pb-8">
              <p className="text-night-muted text-[13px] font-semibold tracking-[-0.2px] bg-[rgba(228,224,218,0.06)] backdrop-blur-[12px] px-3 py-1 rounded-pill">
                전신이 보이도록 카메라를 위치시켜 주세요
              </p>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {cameraState === 'recording' && (
          <div className="absolute top-safe-top left-0 right-0 px-5 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-tension-surface backdrop-blur-[12px] border border-[rgba(212,91,91,0.15)] rounded-pill px-3.5 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tension opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-tension shadow-[0_0_6px_rgba(212,91,91,0.4)]" />
                </span>
                <span className="text-night-text text-[13px] font-bold tracking-[0.5px] tabular-nums">
                  {formatDuration(duration)}
                </span>
              </div>

              {/* Pose detection status */}
              <div className="bg-[rgba(228,224,218,0.06)] backdrop-blur-[12px] rounded-pill px-3 py-1.5">
                <span className={cn(
                  'text-[11px] font-semibold',
                  poseStatus === 'ready' ? 'text-calm' : 'text-caution'
                )}>
                  {poseStatus === 'ready' ? 'AI 포즈 감지 중' : 'AI 모델 로딩 중...'}
                </span>
              </div>
            </div>

            {/* Duration progress bar */}
            <div className="mt-2 h-1 bg-night-border rounded-full overflow-hidden">
              <div
                className="h-full bg-tension rounded-full transition-all duration-1000"
                style={{ width: `${(duration / MAX_VIDEO_DURATION_SEC) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {cameraState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-night/70">
            <div className="text-center px-6">
              <p className="text-night-text text-base mb-4">{cameraError || poseError}</p>
              <button
                type="button"
                onClick={onCancel}
                className="text-night-muted text-sm underline"
              >
                돌아가기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-night px-6 py-6 safe-area-bottom">
        <div className="flex items-center justify-around">
          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="w-11 h-11 rounded-full bg-[rgba(228,224,218,0.04)] backdrop-blur-sm border border-[rgba(228,224,218,0.04)] flex items-center justify-center text-night-muted active:scale-90 text-sm"
          >
            취소
          </button>

          {/* Record/Stop */}
          {cameraState === 'ready' && (
            <button
              type="button"
              onClick={handleStart}
              className="w-[68px] h-[68px] rounded-full border-[3px] border-night-text flex items-center justify-center active:scale-[0.93]"
              aria-label="촬영 시작"
            >
              <div className="w-[54px] h-[54px] rounded-full bg-night-text" />
            </button>
          )}

          {cameraState === 'recording' && (
            <button
              type="button"
              onClick={handleStop}
              className="w-[68px] h-[68px] rounded-full border-[3px] border-tension flex items-center justify-center active:scale-[0.93]"
              aria-label="촬영 중지"
            >
              <div className="w-7 h-7 rounded-[6px] bg-tension" />
            </button>
          )}

          {cameraState === 'initializing' && (
            <div className="w-[68px] h-[68px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-night-border border-t-night-text rounded-full animate-spin" />
            </div>
          )}

          {/* Flip camera placeholder */}
          <button
            type="button"
            className="w-11 h-11 rounded-full bg-[rgba(228,224,218,0.04)] backdrop-blur-sm border border-[rgba(228,224,218,0.04)] flex items-center justify-center text-night-muted active:scale-90 text-sm"
            onClick={() => {
              /* Camera flip — future enhancement */
            }}
          >
            전환
          </button>
        </div>
      </div>
    </div>
  );
}
