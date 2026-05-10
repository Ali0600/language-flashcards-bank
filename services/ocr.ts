import type { OcrResult } from '@/lib/types';

export async function recognizeText(_imageUri: string): Promise<OcrResult> {
  return {
    fullText: '',
    elements: [],
    avgConfidence: 0,
    source: 'mlkit',
  };
}

export type OcrQualityVerdict = {
  shouldUseLlm: boolean;
  reason: string;
};

export function assessOcrQuality(_result: OcrResult): OcrQualityVerdict {
  return { shouldUseLlm: true, reason: 'on-device OCR disabled (simulator-only build)' };
}
