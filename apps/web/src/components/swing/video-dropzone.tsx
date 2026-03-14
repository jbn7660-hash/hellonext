/**
 * VideoDropzone Component
 *
 * "Parasite UX" — lets users import swing videos from gallery/file system.
 * Used in both pro and member contexts.
 *
 * Pro: shows member picker after file selection.
 * Member: uploads directly to own swingbook.
 *
 * @module components/swing/video-dropzone
 * @feature F-009
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

interface VideoDropzoneProps {
  mode: 'pro' | 'member';
  /** For pro: list of members to pick from */
  members?: { id: string; display_name: string }[];
  onUploadComplete?: (videoId: string) => void;
  className?: string;
}

type UploadState = 'idle' | 'selected' | 'uploading' | 'done' | 'error';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_TYPES = '.mp4,.mov,.webm,.m4v';
const ACCEPTED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
const MAX_VIDEO_DURATION_SEC = 60;

export function VideoDropzone({ mode, members, onUploadComplete, className }: VideoDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, memberId: string | null) => {
    setUploadState('uploading');
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('source', 'dropzone');
      if (memberId) formData.append('member_id', memberId);

      // Try XMLHttpRequest for better progress tracking if available
      const uploadWithProgress = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              setProgress(Math.min(percentComplete, 95)); // Cap at 95% before completion
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
              } catch {
                reject(new Error('Invalid response format'));
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.error || `Upload failed (${xhr.status})`));
              } catch {
                reject(new Error(`Upload failed (${xhr.status})`));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
          });

          xhr.open('POST', '/api/swing-videos');
          xhr.send(formData);
        });
      };

      const response = await uploadWithProgress();
      const { data } = response;
      setProgress(100);
      setUploadState('done');
      onUploadComplete?.(data.id);

      logger.info('Video uploaded via dropzone', { videoId: data.id, mode, fileSize: file.size });

      // Reset after delay
      setTimeout(() => {
        setUploadState('idle');
        setSelectedFile(null);
        setSelectedMemberId(null);
        setProgress(0);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '업로드에 실패했습니다.';
      setError(message);
      setUploadState('error');
      logger.error('Dropzone upload failed', { error: err, fileSize: file.size });
    }
  }, [onUploadComplete]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('영상이 너무 큽니다. 100MB 이하의 영상을 선택해주세요.');
      return;
    }

    // Validate file type
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError(`지원하지 않는 파일 형식입니다. MP4, MOV, WebM 파일을 선택해주세요. (${file.type})`);
      return;
    }

    // Validate video duration (basic check via file metadata if available)
    // Full validation happens on server
    const video = document.createElement('video');
    video.onloadedmetadata = () => {
      if (video.duration > MAX_VIDEO_DURATION_SEC) {
        setError(`영상이 60초를 초과합니다. (${Math.round(video.duration)}초)`);
        setSelectedFile(null);
      } else {
        setSelectedFile(file);
        setError(null);

        // Member: auto-upload. Pro: wait for member selection.
        if (mode === 'member') {
          setUploadState('uploading');
          uploadFile(file, null);
        } else {
          setUploadState('selected');
        }
      }
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      // If metadata fails to load, allow it (may not be available in all contexts)
      setSelectedFile(file);
      setError(null);

      if (mode === 'member') {
        setUploadState('uploading');
        uploadFile(file, null);
      } else {
        setUploadState('selected');
      }
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  }, [mode, uploadFile]);

  const handleProUpload = useCallback(() => {
    if (!selectedFile || !selectedMemberId) return;
    uploadFile(selectedFile, selectedMemberId);
  }, [selectedFile, selectedMemberId, uploadFile]);

  return (
    <div className={cn('w-full', className)}>
      {/* Drop Area */}
      {uploadState === 'idle' && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
        >
          <UploadIcon className="w-8 h-8 text-gray-400" />
          <span className="text-sm font-medium text-text-secondary">
            {mode === 'pro' ? '갤러리/GTS에서 영상 가져오기' : '갤러리에서 영상 가져오기'}
          </span>
          <span className="text-xs text-text-tertiary">MP4, MOV, WebM · 최대 60초</span>
        </button>
      )}

      {/* Pro: Member Selection */}
      {uploadState === 'selected' && mode === 'pro' && (
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-primary font-medium">
            {selectedFile?.name} — 회원을 선택하세요
          </p>
          <div className="grid grid-cols-2 gap-2">
            {members?.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMemberId(m.id)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm text-left transition-colors',
                  selectedMemberId === m.id
                    ? 'border-brand-primary bg-brand-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                {m.display_name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleProUpload}
            disabled={!selectedMemberId}
            className={cn(
              'btn-primary w-full py-2 text-sm',
              !selectedMemberId && 'opacity-50 cursor-not-allowed'
            )}
          >
            업로드
          </button>
        </div>
      )}

      {/* Uploading Progress */}
      {uploadState === 'uploading' && (
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-2 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
            <span className="text-sm text-text-primary">업로드 중... {progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Done */}
      {uploadState === 'done' && (
        <div className="card p-4 text-center animate-fade-in">
          <span className="text-2xl">✅</span>
          <p className="text-sm text-brand-primary font-medium mt-1">업로드 완료</p>
        </div>
      )}

      {/* Error */}
      {(uploadState === 'error' || error) && (
        <div className="card p-4 border-status-error/30">
          <p className="text-sm text-status-error mb-2">{error}</p>
          <button
            type="button"
            onClick={() => {
              setUploadState('idle');
              setError(null);
              setSelectedFile(null);
            }}
            className="text-xs text-brand-primary underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
