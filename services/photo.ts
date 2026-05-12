import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { photos } from '@/db/schema';
import type { FolderSlug } from '@/constants/folders';

/**
 * Update the auto-categorized folder of a photo. Pass null to mark it as
 * uncategorized (e.g. revert a Gemini misclassification while leaving it
 * out of every named folder).
 */
export async function updatePhotoCategory(
  id: string,
  category: FolderSlug | null,
): Promise<void> {
  await db.update(photos).set({ category }).where(eq(photos.id, id));
}
