import {
  buildCsv,
  CSV_BOM,
  CSV_HEADERS,
  csvEscape,
  stateLabel,
  type CardExportRow,
} from '../csv';

describe('csvEscape', () => {
  it('returns empty string for null/undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('stringifies primitives', () => {
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape('hello')).toBe('hello');
  });

  it('quotes values containing commas', () => {
    expect(csvEscape('a, b')).toBe('"a, b"');
  });

  it('quotes values containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('quotes and doubles internal quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('leaves umlauts alone', () => {
    expect(csvEscape('Apfel mit Käse')).toBe('Apfel mit Käse');
  });
});

describe('stateLabel', () => {
  it.each([
    [0, 'New'],
    [1, 'Learning'],
    [2, 'Review'],
    [3, 'Relearning'],
  ])('maps state %i to %s', (n, label) => {
    expect(stateLabel(n)).toBe(label);
  });

  it('falls back to the numeric string for unknown states', () => {
    expect(stateLabel(99)).toBe('99');
  });
});

describe('buildCsv', () => {
  const sample: CardExportRow = {
    lemma: 'Apfel',
    gender: 'der',
    pos: 'noun',
    translationEn: 'apple',
    plural: 'Äpfel',
    exampleDe: 'Ich esse einen Apfel.',
    exampleEn: 'I eat an apple.',
    state: 1,
    due: Date.UTC(2026, 4, 12),
    reps: 3,
    lapses: 0,
    createdAt: Date.UTC(2026, 4, 10),
    freq: 7,
  };

  it('starts with the UTF-8 BOM', () => {
    const csv = buildCsv([sample]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it('emits the header row right after the BOM', () => {
    const csv = buildCsv([]);
    expect(csv).toBe(CSV_BOM + CSV_HEADERS.join(','));
  });

  it('emits all 13 columns per row in the documented order', () => {
    const csv = buildCsv([sample]);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    const cells = lines[1]!.split(',');
    expect(cells).toHaveLength(13);
    expect(cells[0]).toBe('Apfel');
    expect(cells[1]).toBe('der');
    expect(cells[7]).toBe('7'); // sighting_count (freq)
    expect(cells[8]).toBe('Learning');
  });

  it('escapes commas inside example sentences', () => {
    const row: CardExportRow = { ...sample, exampleDe: 'Ja, gerne.' };
    const csv = buildCsv([row]);
    expect(csv).toContain('"Ja, gerne."');
  });

  it('serializes due and createdAt as ISO strings', () => {
    const csv = buildCsv([sample]);
    expect(csv).toContain(new Date(sample.due).toISOString());
    expect(csv).toContain(new Date(sample.createdAt).toISOString());
  });

  it('handles null fields without crashing', () => {
    const row: CardExportRow = {
      ...sample,
      gender: null,
      pos: null,
      translationEn: null,
      plural: null,
      exampleDe: null,
      exampleEn: null,
    };
    const csv = buildCsv([row]);
    // 6 consecutive commas indicate the 6 nulls becoming empty cells
    const cells = csv.slice(1).split('\n')[1]!.split(',');
    expect(cells[1]).toBe('');
    expect(cells[2]).toBe('');
    expect(cells[3]).toBe('');
    expect(cells[4]).toBe('');
    expect(cells[5]).toBe('');
    expect(cells[6]).toBe('');
  });
});
