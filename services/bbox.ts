import type { BBox } from '@/lib/types';

/**
 * Pure helpers for rendering Gemini-format bounding boxes over images.
 *
 * Gemini returns bboxes as `[ymin, xmin, ymax, xmax]` normalized to `[0, 1000]`.
 * To draw them on screen we need to know two things the model doesn't tell us:
 * the on-screen rect the image is actually drawn into (which depends on the
 * source image's aspect ratio and the container's `contentFit`) and the
 * container's measured size. Everything below is just arithmetic given those.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type ScreenBox = { left: number; top: number; width: number; height: number };

/**
 * Parse a JSON-encoded bbox from the DB. Returns null for null/invalid input.
 */
export function parseBBox(json: string | null | undefined): BBox | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const nums = parsed.map((v) => (typeof v === 'number' ? v : Number(v)));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!] as BBox;
  } catch {
    return null;
  }
}

/**
 * Compute the rect (in container coordinates) that an image of the given
 * intrinsic size occupies when drawn into the container with `contain` fit.
 *
 * Returns a zero-sized rect if any input is non-positive — caller should
 * treat that as "not measured yet" and not render overlays.
 */
export function containRect(
  container: { width: number; height: number },
  image: { width: number; height: number },
): Rect {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const containerAR = container.width / container.height;
  const imageAR = image.width / image.height;
  if (imageAR > containerAR) {
    // Image is wider relative to container — fits to width, letterboxed top/bottom.
    const w = container.width;
    const h = container.width / imageAR;
    return { x: 0, y: (container.height - h) / 2, w, h };
  }
  // Image is taller (or equal) — fits to height, letterboxed left/right.
  const h = container.height;
  const w = container.height * imageAR;
  return { x: (container.width - w) / 2, y: 0, w, h };
}

/**
 * Map a Gemini-normalized bbox to absolute screen coordinates within a
 * pre-computed image rect.
 */
export function bboxToScreen(bbox: BBox, rect: Rect): ScreenBox {
  const [ymin, xmin, ymax, xmax] = bbox;
  return {
    left: rect.x + (xmin / 1000) * rect.w,
    top: rect.y + (ymin / 1000) * rect.h,
    width: ((xmax - xmin) / 1000) * rect.w,
    height: ((ymax - ymin) / 1000) * rect.h,
  };
}
