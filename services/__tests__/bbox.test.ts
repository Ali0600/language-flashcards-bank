import { bboxToScreen, containRect, parseBBox } from '../bbox';

describe('parseBBox', () => {
  it('parses a valid JSON-encoded 4-tuple', () => {
    expect(parseBBox('[100, 200, 300, 400]')).toEqual([100, 200, 300, 400]);
  });

  it('returns null for null or empty input', () => {
    expect(parseBBox(null)).toBeNull();
    expect(parseBBox(undefined)).toBeNull();
    expect(parseBBox('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseBBox('not json')).toBeNull();
    expect(parseBBox('[1, 2')).toBeNull();
  });

  it('returns null for wrong-length arrays', () => {
    expect(parseBBox('[1, 2, 3]')).toBeNull();
    expect(parseBBox('[1, 2, 3, 4, 5]')).toBeNull();
  });

  it('returns null if any value is not finite', () => {
    expect(parseBBox('[1, "x", 3, 4]')).toBeNull();
  });

  it('coerces stringified numbers', () => {
    expect(parseBBox('["100", "200", "300", "400"]')).toEqual([100, 200, 300, 400]);
  });
});

describe('containRect', () => {
  it('matches container exactly when ratios match', () => {
    const r = containRect({ width: 400, height: 200 }, { width: 800, height: 400 });
    expect(r).toEqual({ x: 0, y: 0, w: 400, h: 200 });
  });

  it('letterboxes top/bottom when image is wider than container', () => {
    // Container 100x100 (AR 1), image 200x100 (AR 2). Image fills width.
    const r = containRect({ width: 100, height: 100 }, { width: 200, height: 100 });
    expect(r.w).toBe(100);
    expect(r.h).toBe(50);
    expect(r.x).toBe(0);
    expect(r.y).toBe(25); // (100 - 50) / 2
  });

  it('letterboxes left/right when image is taller than container', () => {
    // Container 100x100, image 100x200. Image fills height.
    const r = containRect({ width: 100, height: 100 }, { width: 100, height: 200 });
    expect(r.h).toBe(100);
    expect(r.w).toBe(50);
    expect(r.y).toBe(0);
    expect(r.x).toBe(25);
  });

  it('returns a zero rect for unmeasured (zero-size) inputs', () => {
    expect(containRect({ width: 0, height: 100 }, { width: 10, height: 10 })).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
    expect(containRect({ width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  });
});

describe('bboxToScreen', () => {
  it('places a centered half-width box correctly', () => {
    // Image rect 100x100 at origin. Box from x=250..750, y=250..750
    // (i.e. centered 50% of image).
    const screen = bboxToScreen([250, 250, 750, 750], { x: 0, y: 0, w: 100, h: 100 });
    expect(screen.left).toBe(25);
    expect(screen.top).toBe(25);
    expect(screen.width).toBe(50);
    expect(screen.height).toBe(50);
  });

  it('offsets by the image rect origin (letterboxing)', () => {
    // Letterboxed image at (0, 50), 200x100.
    const screen = bboxToScreen([0, 0, 1000, 1000], { x: 0, y: 50, w: 200, h: 100 });
    expect(screen.left).toBe(0);
    expect(screen.top).toBe(50);
    expect(screen.width).toBe(200);
    expect(screen.height).toBe(100);
  });
});
