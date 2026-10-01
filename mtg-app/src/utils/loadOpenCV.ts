/**
 * Load OpenCV.js lazily for card edge detection.
 * Prefer a self-hosted copy under /vendor/opencv.js (no third-party runtime).
 * Falls back to CDN mirrors only if the local file is missing.
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
      threshold: (src: any, dst: any, thresh: number, maxval: number, type: number) => number;
      adaptiveThreshold: (
        src: any,
        dst: any,
        maxValue: number,
        adaptiveMethod: number,
        thresholdType: number,
        blockSize: number,
        C: number
      ) => void;
      dilate: (src: any, dst: any, kernel: any) => void;
      morphologyEx: (src: any, dst: any, op: number, kernel: any) => void;
      getStructuringElement: (shape: number, ksize: any) => any;
      mean: (src: any) => number[] | Float64Array;
      findContours: (src: any, contours: any, hierarchy: any, mode: number, method: number) => void;
      approxPolyDP: (curve: any, approx: any, epsilon: number, closed: boolean) => void;
      contourArea: (contour: any) => number;
      arcLength: (curve: any, closed: boolean) => number;
      minAreaRect: (contour: any) => any;
      boundingRect: (contour: any) => { x: number; y: number; width: number; height: number };
      boxPoints?: (rect: any, out?: any) => any;
      CLAHE?: new (clipLimit?: number, tileGridSize?: any) => { apply: (src: any, dst: any) => void; delete: () => void };
      Mat: { new (): any; ones: (rows: number, cols: number, type: number) => any };
      MatVector: new () => any;
      matFromArray: (rows: number, cols: number, type: number, array: number[] | Float32Array) => any;
      Size: new (w: number, h: number) => any;
      Point: new (x: number, y: number) => any;
      RotatedRect?: { points: (rect: any) => Array<{ x: number; y: number }> };
      CV_8U: number;
      CV_8UC1: number;
      CV_8UC4: number;
      CV_32FC1: number;
      COLOR_RGBA2GRAY: number;
      THRESH_BINARY: number;
      THRESH_BINARY_INV: number;
      THRESH_OTSU: number;
      ADAPTIVE_THRESH_GAUSSIAN_C: number;
      MORPH_RECT: number;
      MORPH_ELLIPSE: number;
      MORPH_CLOSE: number;
      MORPH_OPEN: number;
      RETR_LIST: number;
      RETR_EXTERNAL: number;
      CHAIN_APPROX_SIMPLE: number;
      getPerspectiveTransform: (src: any, dst: any) => any;
      warpPerspective: (
        src: any,
        dst: any,
        M: any,
        dsize: any,
        flags?: number,
        borderMode?: number
      ) => void;
      INTER_LINEAR: number;
      BORDER_CONSTANT: number;
      [key: string]: unknown;
    };
  }
}

const LOCAL_OPENCV_URL = `${import.meta.env.BASE_URL}vendor/opencv.js`;
/** Mirrors — docs.opencv.org is often blocked / flaky. */
const CDN_OPENCV_URLS = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.8.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.8.0/opencv.js',
];

let loadPromise: Promise<void> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const timeout = window.setTimeout(() => {
      done(new Error(`OpenCV load timed out: ${src}`));
    }, 60000);

    (window as Window & { Module?: { onRuntimeInitialized?: () => void } }).Module = {
      onRuntimeInitialized: () => {
        window.clearTimeout(timeout);
        done();
      },
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    // Same-origin local file: avoid crossOrigin (can break some hosts)
    if (!src.startsWith('/') && !src.startsWith(window.location.origin)) {
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => {
      if (window.cv && typeof window.cv.Mat === 'function') {
        window.clearTimeout(timeout);
        done();
      }
      // else wait for onRuntimeInitialized
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      done(new Error(`Failed to load OpenCV from ${src}`));
    };
    document.head.appendChild(script);
  });
}

export function loadOpenCV(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV only available in browser'));
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Always try local first (HEAD probes often 405/timeout on large static files)
    try {
      await injectScript(LOCAL_OPENCV_URL);
      return;
    } catch (e) {
      console.warn('OpenCV: local /vendor/opencv.js failed, trying CDN…', e);
      if (import.meta.env.DEV) {
        console.warn(
          'If missing, run: curl -L -o public/vendor/opencv.js https://docs.opencv.org/4.8.0/opencv.js'
        );
      }
    }

    let lastErr: unknown;
    for (const url of CDN_OPENCV_URLS) {
      try {
        await injectScript(url);
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`OpenCV CDN failed: ${url}`, e);
      }
    }
    loadPromise = null;
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Failed to load OpenCV from local file and CDN mirrors');
  })();

  return loadPromise;
}

export function isOpenCVLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.cv;
}

/** Clear cached load promise (tests / retry after sidecar/vendor fix). */
export function resetOpenCVLoader(): void {
  loadPromise = null;
}
