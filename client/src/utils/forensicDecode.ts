import {
  MultiFormatReader, BarcodeFormat, DecodeHintType,
  RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer,
} from '@zxing/library';

/**
 * Decode the forensic QR from a canvas and return its raw text (an opaque
 * encrypted token). Decryption happens server-side via /api/forensic/decode.
 *
 * QR self-localises (finder patterns) and ZXing binarises it locally, so it reads
 * anywhere on any background — no cropping needed. Tries the local binarizer first,
 * then a global one. Returns null when nothing decodes.
 */

const hints = new Map<DecodeHintType, unknown>();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
hints.set(DecodeHintType.TRY_HARDER, true);

function toLuminance(canvas: HTMLCanvasElement): { buf: Uint8ClampedArray; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const buf = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    buf[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  }
  return { buf, w, h };
}

export function decodeForensicQr(canvas: HTMLCanvasElement): string | null {
  const lum = toLuminance(canvas);
  if (!lum) return null;
  for (const Binarizer of [HybridBinarizer, GlobalHistogramBinarizer]) {
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    try {
      const source = new RGBLuminanceSource(lum.buf, lum.w, lum.h);
      return reader.decode(new BinaryBitmap(new Binarizer(source)), hints).getText();
    } catch {
      /* try next binarizer */
    }
  }
  return null;
}
