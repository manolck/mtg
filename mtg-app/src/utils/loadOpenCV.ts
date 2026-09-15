/**
 * Load OpenCV.js lazily for card edge detection.
 * Prefer a self-hosted copy under /vendor/opencv.js (no third-party runtime).
 * Falls back to the official CDN only if the local file is missing.
 */

declare global {
  interface Window {
    cv?: {
      onRuntimeInitialized: () => void;
      imread: (element: HTMLCanvasElement | string) => any;
      imshow: (canvasId: string, mat: any) => void;
      cvtColor: (src: any, dst: any, code: number) => void;
      GaussianBlur: (src: any, dst: any, ksize: any, sigmaX: number) => void;
      Canny: (src: any, dst: any, threshold1: number, threshold2: number) => void;
      bitwise_not: (src: any, dst: any) => void;
      threshold: (src: any, dst: any, thresh: number, maxval: number, type: number) => void;
      findContours: (src: any, contours: any, hierarchy: any, mode: number, method: number) => void;
      approxPolyDP: (curve: any, approx: any, epsilon: number, closed: boolean) => void;
      contourArea: (contour: any) => number;
      arcLength: (curve: any, closed: boolean) => number;
      Mat: new () => any;
      matFromArray: (rows: number, cols: number, type: number, array: number[] | Float32Array) => any;
      Size: new (w: number, h: number) => any;
      Point: new (x: number, y: number) => any;
      CV_8UC1: number;
      CV_8UC4: number;
      CV_32FC1: number;
      COLOR_RGBA2GRAY: number;
      THRESH_BINARY: number;
      RETR_LIST: number;
      CHAIN_APPROX_SIMPLE: number;
      getPerspectiveTransform: (src: any, dst: any) => any;
      warpPerspective: (src: any, dst: any, M: any, dsize: any, flags?: number, borderMode?: number) => void;
      INTER_LINEAR: number;
      BORDER_CONSTANT: number;
      [key: string]: unknown;
    };
  }
}

const LOCAL_OPENCV_URL = `${import.meta.env.BASE_URL}vendor/opencv.js`;
const CDN_OPENCV_URL = 'https://docs.opencv.org/4.8.0/opencv.js';

let loadPromise: Promise<void> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    (window as Window & { Module?: { onRuntimeInitialized?: () => void } }).Module = {
      onRuntimeInitialized: () => resolve(),
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (!window.cv) {
        reject(new Error('OpenCV failed to load'));
      }
      // Some builds resolve via onRuntimeInitialized; if cv is already ready, resolve now
      if (window.cv && typeof window.cv.Mat === 'function') {
        resolve();
      }
    };
    script.onerror = () => reject(new Error(`Failed to load OpenCV from ${src}`));
    document.head.appendChild(script);
  });
}

async function localOpenCvAvailable(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL_OPENCV_URL, { method: 'HEAD', cache: 'no-cache' });
    return res.ok;
  } catch {
    return false;
  }
}

export function loadOpenCV(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV only available in browser'));
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (await localOpenCvAvailable()) {
      await injectScript(LOCAL_OPENCV_URL);
      return;
    }
    if (import.meta.env.DEV) {
      console.warn(
        'OpenCV: /public/vendor/opencv.js missing — falling back to CDN. For production, download opencv.js 4.8.0 into public/vendor/.'
      );
    }
    await injectScript(CDN_OPENCV_URL);
  })();

  return loadPromise;
}

export function isOpenCVLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.cv;
}
