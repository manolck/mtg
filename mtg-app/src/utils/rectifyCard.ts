/**
 * Rectify a card quad (perspective transform) so the card appears flat and horizontal.
 * Used before OCR so Tesseract receives horizontal text.
 */

import { loadOpenCV } from './loadOpenCV';
import type { Quadrilateral } from './cardEdgeDetection';

/** Order 4 points as TL, TR, BR, BL from quad points (any order). */
function orderCorners(points: [number, number][]): [number, number][] {
  if (points.length !== 4) return points;
  const byY = [...points].sort((a, b) => a[1] - b[1]);
  const [top0, top1] = byY.slice(0, 2);
  const [bot0, bot1] = byY.slice(2, 4);
  const tl = top0[0] < top1[0] ? top0 : top1;
  const tr = top0[0] < top1[0] ? top1 : top0;
  const bl = bot0[0] < bot1[0] ? bot0 : bot1;
  const br = bot0[0] < bot1[0] ? bot1 : bot0;
  return [tl, tr, br, bl];
}

/**
 * Rectify the card region from the source canvas using the quad, outputting a flat rectangle.
 * @param sourceCanvas - Full frame canvas (e.g. captured video frame)
 * @param quad - Four corners of the card in source canvas coordinates
 * @param outputWidth - Width of the output rectified card (e.g. 223 for 63:88 ratio)
 * @param outputHeight - Height of the output rectified card (e.g. 311)
 * @returns Canvas containing the rectified card image (horizontal text)
 */
export async function rectifyCardToCanvas(
  sourceCanvas: HTMLCanvasElement,
  quad: Quadrilateral,
  outputWidth: number,
  outputHeight: number
): Promise<HTMLCanvasElement> {
  await loadOpenCV();
  const cv = typeof window !== 'undefined' ? window.cv : null;
  if (!cv) throw new Error('OpenCV not available');

  const [tl, tr, br, bl] = orderCorners(quad.points);
  const srcData = [tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]];
  const dstData = [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight];

  const srcMat = cv.matFromArray(4, 2, cv.CV_32FC1, srcData);
  const dstMat = cv.matFromArray(4, 2, cv.CV_32FC1, dstData);
  const srcImage = cv.imread(sourceCanvas);
  const dstImage = new cv.Mat();
  let transformMat: any = null;

  try {
    transformMat = cv.getPerspectiveTransform(srcMat, dstMat);
    const dsize = new cv.Size(outputWidth, outputHeight);
    cv.warpPerspective(
      srcImage,
      dstImage,
      transformMat,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT
    );

    const tempId = 'rectify-output-' + Date.now();
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = outputWidth;
    tempCanvas.height = outputHeight;
    tempCanvas.id = tempId;
    document.body.appendChild(tempCanvas);
    cv.imshow(tempId, dstImage);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputWidth;
    outCanvas.height = outputHeight;
    const ctx = outCanvas.getContext('2d');
    if (ctx) ctx.drawImage(tempCanvas, 0, 0);
    document.body.removeChild(tempCanvas);
    return outCanvas;
  } finally {
    srcMat.delete();
    dstMat.delete();
    srcImage.delete();
    dstImage.delete();
    if (transformMat) transformMat.delete();
  }
}
