export const FOLDER_SLUGS = [
  'food_drink_packaging',
  'cooking_recipes',
  'household_items',
  'signs_notices',
  'transport_travel',
  'health_personal_care',
  'documents_mail',
  'clothing_textiles',
  'electronics_appliances',
  'outdoor_nature',
  'other',
] as const;

export type FolderSlug = (typeof FOLDER_SLUGS)[number];

export const UNCATEGORIZED_SLUG = 'uncategorized' as const;

export type AnyFolderSlug = FolderSlug | typeof UNCATEGORIZED_SLUG;

export const FOLDER_LABELS: Record<AnyFolderSlug, string> = {
  food_drink_packaging: 'Food & Drink Packaging',
  cooking_recipes: 'Cooking & Recipes',
  household_items: 'Household Items',
  signs_notices: 'Signs & Public Notices',
  transport_travel: 'Transport & Travel',
  health_personal_care: 'Health & Personal Care',
  documents_mail: 'Documents & Mail',
  clothing_textiles: 'Clothing & Textiles',
  electronics_appliances: 'Electronics & Appliances',
  outdoor_nature: 'Outdoor & Nature',
  other: 'Other',
  uncategorized: 'Uncategorized',
};

export const FOLDER_ICONS: Record<
  AnyFolderSlug,
  | 'shippingbox.fill'
  | 'fork.knife'
  | 'house.fill'
  | 'signpost.right.fill'
  | 'tram.fill'
  | 'cross.case.fill'
  | 'doc.fill'
  | 'tshirt.fill'
  | 'tv.fill'
  | 'leaf.fill'
  | 'square.stack.fill'
  | 'questionmark.folder.fill'
> = {
  food_drink_packaging: 'shippingbox.fill',
  cooking_recipes: 'fork.knife',
  household_items: 'house.fill',
  signs_notices: 'signpost.right.fill',
  transport_travel: 'tram.fill',
  health_personal_care: 'cross.case.fill',
  documents_mail: 'doc.fill',
  clothing_textiles: 'tshirt.fill',
  electronics_appliances: 'tv.fill',
  outdoor_nature: 'leaf.fill',
  other: 'square.stack.fill',
  uncategorized: 'questionmark.folder.fill',
};

export function folderLabel(slug: string | null | undefined): string {
  if (!slug) return FOLDER_LABELS.uncategorized;
  return (FOLDER_LABELS as Record<string, string>)[slug] ?? FOLDER_LABELS.other;
}

export function normalizeCategory(value: string | null | undefined): FolderSlug | null {
  if (!value) return null;
  return (FOLDER_SLUGS as readonly string[]).includes(value) ? (value as FolderSlug) : 'other';
}
