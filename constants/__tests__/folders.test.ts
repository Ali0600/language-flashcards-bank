import {
  FOLDER_LABELS,
  FOLDER_SLUGS,
  folderLabel,
  normalizeCategory,
  UNCATEGORIZED_SLUG,
} from '../folders';

describe('folderLabel', () => {
  it('returns the matching label for each known slug', () => {
    for (const slug of FOLDER_SLUGS) {
      expect(folderLabel(slug)).toBe(FOLDER_LABELS[slug]);
    }
  });

  it('returns "Uncategorized" for null/undefined/empty', () => {
    expect(folderLabel(null)).toBe(FOLDER_LABELS.uncategorized);
    expect(folderLabel(undefined)).toBe(FOLDER_LABELS.uncategorized);
    expect(folderLabel('')).toBe(FOLDER_LABELS.uncategorized);
  });

  it('returns the uncategorized label for the uncategorized slug', () => {
    expect(folderLabel(UNCATEGORIZED_SLUG)).toBe(FOLDER_LABELS.uncategorized);
  });

  it('falls back to "Other" for unknown slugs', () => {
    expect(folderLabel('not_a_real_slug')).toBe(FOLDER_LABELS.other);
  });
});

describe('normalizeCategory', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
    expect(normalizeCategory('')).toBeNull();
  });

  it('returns the slug unchanged when it is in the enum', () => {
    for (const slug of FOLDER_SLUGS) {
      expect(normalizeCategory(slug)).toBe(slug);
    }
  });

  it('coerces unknown values to "other"', () => {
    expect(normalizeCategory('cooking')).toBe('other');
    expect(normalizeCategory('food')).toBe('other');
    expect(normalizeCategory('totally made up')).toBe('other');
  });
});

describe('FOLDER_LABELS shape', () => {
  it('has a label for every slug plus uncategorized', () => {
    for (const slug of FOLDER_SLUGS) {
      expect(typeof FOLDER_LABELS[slug]).toBe('string');
      expect(FOLDER_LABELS[slug].length).toBeGreaterThan(0);
    }
    expect(typeof FOLDER_LABELS.uncategorized).toBe('string');
  });
});
