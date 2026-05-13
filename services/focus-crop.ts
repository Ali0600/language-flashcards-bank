/**
 * Pure helpers for converting a user-drawn selection on a `contentFit="contain"`
 * image into a crop rect in the source image's natural pixel coordinates.
 *
 * The drawing UI works in *container* coordinates (the View around the Image).
 * The image is drawn into a sub-rect of that container (letterboxed when the
 * aspect ratios don't match — see `containRect` in services/bbox.ts). The
 * cropper (`expo-image-manipulator`) operates on the *file's* pixel grid, which
 * is the natural image size. So the conversion is two steps:
 *
 *   1. Clamp the selection to the rendered image rect (the user can drag
 *      outside the image into the letterbox; those pixels don't exist).
 *   2. Translate + scale into natural pixel coordinates.
 */

export type SelectionRect = { left: number; top: number; width: number; height: number };
export type ImageRect = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };
export type CropRect = { originX: number; originY: number; width: number; height: number };

/**
 * Convert a selection in container coordinates into a crop rect in the source
 * image's natural pixel coordinates.
 *
 * Returns `null` when the selection has zero overlap with the rendered image
 * rect — callers should fall back to "scan whole image" in that case.
 */
export function containerSelectionToImageCrop(
  selection: SelectionRect,
  imageRect: ImageRect,
  naturalSize: Size,
): CropRect | null {
  if (
    imageRect.w <= 0 ||
    imageRect.h <= 0 ||
    naturalSize.width <= 0 ||
    naturalSize.height <= 0
  ) {
    return null;
  }

  // Clamp the selection to the on-screen image rect.
  const left = Math.max(imageRect.x, selection.left);
  const top = Math.max(imageRect.y, selection.top);
  const right = Math.min(imageRect.x + imageRect.w, selection.left + selection.width);
  const bottom = Math.min(imageRect.y + imageRect.h, selection.top + selection.height);

  if (right <= left || bottom <= top) return null;

  const scaleX = naturalSize.width / imageRect.w;
  const scaleY = naturalSize.height / imageRect.h;

  return {
    originX: (left - imageRect.x) * scaleX,
    originY: (top - imageRect.y) * scaleY,
    width: (right - left) * scaleX,
    height: (bottom - top) * scaleY,
  };
}

/**
 * Pad a crop rect by a fraction of its own dimensions, clamping the result to
 * the natural image bounds. Used to keep a little surrounding context (e.g. 5%)
 * around the user's drawn rectangle so Gemini sees neighbouring letters.
 */
export function padCropRect(rect: CropRect, paddingFrac: number, bounds: Size): CropRect {
  const padX = rect.width * paddingFrac;
  const padY = rect.height * paddingFrac;
  const originX = Math.max(0, rect.originX - padX);
  const originY = Math.max(0, rect.originY - padY);
  const right = Math.min(bounds.width, rect.originX + rect.width + padX);
  const bottom = Math.min(bounds.height, rect.originY + rect.height + padY);
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(Math.max(0, right - originX)),
    height: Math.round(Math.max(0, bottom - originY)),
  };
}

/**
 * Reject crop rects that are too small to be useful. `minDimension` is in
 * natural pixels — anything below ~80px tends to produce unreliable OCR.
 */
export function isViableCrop(rect: CropRect, minDimension: number): boolean {
  return rect.width >= minDimension && rect.height >= minDimension;
}
