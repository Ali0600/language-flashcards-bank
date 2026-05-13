export type Gender = 'der' | 'die' | 'das';

export type CardDirection = 'de_to_en' | 'en_to_de';

/**
 * Gemini-format bounding box: [ymin, xmin, ymax, xmax] normalized to [0, 1000].
 * `ymin/ymax` are along the vertical axis, `xmin/xmax` along the horizontal.
 * Convert to pixels by `(coord / 1000) * imageDimension`.
 */
export type BBox = readonly [number, number, number, number];

export type WordAnalysis = {
  surface: string;
  lemma: string;
  gender: Gender | null;
  pos: string;
  translationEn: string;
  exampleDe: string;
  exampleEn: string;
  plural: string | null;
  bbox: BBox | null;
};
