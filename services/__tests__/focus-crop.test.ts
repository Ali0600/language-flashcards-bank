import {
  containerSelectionToImageCrop,
  isViableCrop,
  padCropRect,
} from '../focus-crop';

describe('containerSelectionToImageCrop', () => {
  // Container 400x400, image rendered into the full container at natural 800x800
  // (so the on-screen rect == container rect, scaleX = scaleY = 2).
  const imageRect = { x: 0, y: 0, w: 400, h: 400 };
  const natural = { width: 800, height: 800 };

  it('translates a centered half-size selection into natural pixels', () => {
    const crop = containerSelectionToImageCrop(
      { left: 100, top: 100, width: 200, height: 200 },
      imageRect,
      natural,
    );
    expect(crop).toEqual({ originX: 200, originY: 200, width: 400, height: 400 });
  });

  it('subtracts the image-rect offset when the image is letterboxed', () => {
    // Image letterboxed 50px from the top.
    const letterboxed = { x: 0, y: 50, w: 400, h: 300 };
    const naturalLB = { width: 800, height: 600 };
    const crop = containerSelectionToImageCrop(
      { left: 0, top: 50, width: 400, height: 300 },
      letterboxed,
      naturalLB,
    );
    expect(crop).toEqual({ originX: 0, originY: 0, width: 800, height: 600 });
  });

  it('clamps a selection that overflows the image rect', () => {
    // User drags from container origin past the right edge.
    const crop = containerSelectionToImageCrop(
      { left: -50, top: -50, width: 200, height: 200 },
      imageRect,
      natural,
    );
    expect(crop).toEqual({ originX: 0, originY: 0, width: 300, height: 300 });
  });

  it('returns null when the selection has no overlap with the image rect', () => {
    // Selection entirely above the image rect.
    const lb = { x: 0, y: 100, w: 400, h: 200 };
    expect(
      containerSelectionToImageCrop(
        { left: 0, top: 0, width: 100, height: 50 },
        lb,
        { width: 400, height: 200 },
      ),
    ).toBeNull();
  });

  it('returns null for an unmeasured (zero-sized) image rect or natural size', () => {
    expect(
      containerSelectionToImageCrop(
        { left: 0, top: 0, width: 100, height: 100 },
        { x: 0, y: 0, w: 0, h: 100 },
        natural,
      ),
    ).toBeNull();
    expect(
      containerSelectionToImageCrop(
        { left: 0, top: 0, width: 100, height: 100 },
        imageRect,
        { width: 0, height: 100 },
      ),
    ).toBeNull();
  });
});

describe('padCropRect', () => {
  const bounds = { width: 1000, height: 800 };

  it('expands by the requested fraction when away from the edge', () => {
    const padded = padCropRect(
      { originX: 400, originY: 400, width: 200, height: 100 },
      0.1,
      bounds,
    );
    // 10% of 200 = 20 in X, 10% of 100 = 10 in Y. Origin shifts back, size grows by 2x pad.
    expect(padded).toEqual({ originX: 380, originY: 390, width: 240, height: 120 });
  });

  it('clamps the origin to zero when padding would push past the top-left', () => {
    const padded = padCropRect(
      { originX: 5, originY: 5, width: 100, height: 100 },
      0.5,
      bounds,
    );
    expect(padded.originX).toBe(0);
    expect(padded.originY).toBe(0);
    // Top-left got clipped, so total width = (rect.originX + width + padX) - 0
    // = 5 + 100 + 50 = 155
    expect(padded.width).toBe(155);
    expect(padded.height).toBe(155);
  });

  it('clamps the right/bottom edge to the image bounds', () => {
    const padded = padCropRect(
      { originX: 900, originY: 700, width: 100, height: 100 },
      0.5,
      bounds,
    );
    // padX/padY = 50 each. Right would extend to 1050 → clamped to 1000.
    // Origin shifts back to 900 - 50 = 850.
    expect(padded.originX).toBe(850);
    expect(padded.originY).toBe(650);
    expect(padded.width).toBe(150); // 1000 - 850
    expect(padded.height).toBe(150); // 800 - 650
  });

  it('is a no-op when padding fraction is zero', () => {
    const rect = { originX: 100, originY: 100, width: 200, height: 200 };
    expect(padCropRect(rect, 0, bounds)).toEqual(rect);
  });
});

describe('isViableCrop', () => {
  it('accepts a rect at or above the minimum dimension', () => {
    expect(isViableCrop({ originX: 0, originY: 0, width: 100, height: 100 }, 80)).toBe(true);
    expect(isViableCrop({ originX: 0, originY: 0, width: 80, height: 80 }, 80)).toBe(true);
  });

  it('rejects rects below the minimum in either dimension', () => {
    expect(isViableCrop({ originX: 0, originY: 0, width: 79, height: 200 }, 80)).toBe(false);
    expect(isViableCrop({ originX: 0, originY: 0, width: 200, height: 50 }, 80)).toBe(false);
  });
});
