import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCameraOptions {
  /** Prefer rear camera on mobile (environment) or front (user) */
  facingMode?: 'environment' | 'user';
  /** Callback when stream is ready */
  onReady?: (stream: MediaStream) => void;
}

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  error: string | null;
  isReady: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /** Capture current video frame to a canvas and return the canvas (for processing) */
  captureFrame: () => HTMLCanvasElement | null;
  /** Capture current frame as blob URL (e.g. for crop step) */
  captureFrameAsDataUrl: () => string | null;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { facingMode = 'environment', onReady } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        await video.play();
        setIsReady(true);
        onReady?.(mediaStream);
      } else {
        setIsReady(true);
        onReady?.(mediaStream);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible d\'accéder à la caméra';
      setError(message);
      setStream(null);
      streamRef.current = null;
      setIsReady(false);
    }
  }, [facingMode, onReady]);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState < 2) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas;
  }, []);

  const captureFrameAsDataUrl = useCallback((): string | null => {
    const canvas = captureFrame();
    return canvas ? canvas.toDataURL('image/jpeg', 0.92) : null;
  }, [captureFrame]);

  return {
    videoRef,
    stream,
    error,
    isReady,
    start,
    stop,
    captureFrame,
    captureFrameAsDataUrl,
  };
}
