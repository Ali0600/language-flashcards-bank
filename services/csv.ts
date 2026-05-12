export const CSV_BOM = '﻿';

export function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function stateLabel(state: number): string {
  return ['New', 'Learning', 'Review', 'Relearning'][state] ?? String(state);
}

export type CardExportRow = {
  lemma: string;
  gender: string | null;
  pos: string | null;
  translationEn: string | null;
  plural: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  state: number;
  due: number;
  reps: number;
  lapses: number;
  createdAt: number;
  freq: number;
};

export const CSV_HEADERS = [
  'lemma',
  'gender',
  'pos',
  'translation_en',
  'plural',
  'example_de',
  'example_en',
  'sighting_count',
  'state',
  'due',
  'reps',
  'lapses',
  'created_at',
] as const;

export function buildCsv(rows: CardExportRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.lemma,
        r.gender ?? '',
        r.pos ?? '',
        r.translationEn ?? '',
        r.plural ?? '',
        r.exampleDe ?? '',
        r.exampleEn ?? '',
        r.freq,
        stateLabel(r.state),
        new Date(r.due).toISOString(),
        r.reps,
        r.lapses,
        new Date(r.createdAt).toISOString(),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return CSV_BOM + lines.join('\n');
}
