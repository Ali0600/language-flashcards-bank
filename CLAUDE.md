# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- `npx expo start --dev-client` — Start the Expo dev server (requires the dev client; the app is NOT Expo Go compatible)
- `npx expo start --dev-client --clear` — Start with Metro cache cleared (use after env or babel changes)
- `eas build --profile production --platform ios` — Cloud build, App Store-signed, for TestFlight
- `eas build --profile development-device --platform ios` — Cloud build for ad-hoc install on a registered iPhone
- `eas submit --platform ios --profile production --latest` — Upload latest build to App Store Connect
- `eas update --branch production --platform ios --message "..."` — Push an OTA JS update (always pass `--platform ios`; see Important Notes)
- `eas env:create production --name <X> --value <Y> --type string` — Set a build-time env var (e.g. for `EXPO_PUBLIC_*` keys)
- `eas env:list production` — Show env vars used by production builds
- `npx expo install <package>` — Install a package and pick a version compatible with the current Expo SDK
- `npx drizzle-kit generate` — Regenerate SQL migrations from `db/schema.ts` after a schema change
- `npx tsc --noEmit` — Type-check without emitting JS
- `npm run lint` — `expo lint` over the project
- `npm test` — Run Jest unit tests (jest-expo preset)
- `npm run test:watch` — Jest in watch mode

## Architecture

**App name:** "Language Flashcards" (`expo.name`). German vocabulary learning via phone photos. Built with React Native + Expo SDK 54, distributed via EAS Build (production profile) + TestFlight, with EAS Update for OTA JS-only changes.

**Capture pipeline:** photo → Gemini Vision API → JSON of words (lemma, gender, POS, translation, example) → dedup by lemma → persist as cards + sightings in op-sqlite. There is no on-device OCR (ML Kit was removed; see Important Notes). Every photo goes straight to Gemini Vision.

**Data model (op-sqlite via Drizzle ORM, see [db/schema.ts](db/schema.ts)):**
- `photos` — id, takenAt, imageUri, rawOcrText, category (one of 12 fixed folder slugs or null for legacy rows), **subCategoryId** (nullable; soft reference into `sub_categories`, only used today for `screenshots` photos to tag the source app)
- `cards` — id, lemma, gender (der/die/das/null), pos, translationEn, exampleDe, exampleEn, plural, notes, **direction** (`de_to_en` | `en_to_de`), plus flat FSRS state columns (due, stability, difficulty, reps, lapses, state, lastReview, learningSteps, elapsedDays, scheduledDays). **Unique constraint is compound on `(lemma, direction)`** so a forward and reverse card can coexist for the same lemma. Library/Folders/frequency queries filter to `direction='de_to_en'` so reverses don't double-count.
- `card_sightings` — id, cardId, photoId, surfaceForm, seenAt, **bbox** (JSON-encoded `[ymin, xmin, ymax, xmax]` normalized to 0–1000, nullable for legacy). Sightings only attach to the forward (DE→EN) card.
- `review_logs` — id, cardId, rating, reviewedAt, plus FSRS snapshot fields for audit.
- `settings` — key/value/updatedAt, JSON-serialized values. Keys: `dailyNewCardLimit`, `playInSilentMode`, `autoCreateReverseCards`, `autoPlayWord`, `shuffleCards`.
- `ignored_words` — `lemma TEXT PRIMARY KEY COLLATE NOCASE`, `addedAt`. Pipeline filters Gemini's output against this table before any cards/sightings get persisted.
- `sub_categories` — id, parentSlug, name, createdAt. Unique on `(parentSlug, name COLLATE NOCASE)` — the unique index in migration 0008 was hand-edited to add the collation (Drizzle's `text()` doesn't emit it). Currently only `parentSlug='screenshots'` is used (sub-cats hold app names like "Instagram"). No FK from `photos.sub_category_id` — `services/subcategory.ts:deleteSubCategory` handles cleanup in one transaction.

**Frequency-suggestion query** (Library "by Frequency" sort + future Study suggested-next rail):
```sql
SELECT c.*, COUNT(s.id) AS freq
FROM cards c LEFT JOIN card_sightings s ON s.card_id = c.id
GROUP BY c.id ORDER BY freq DESC;
```

**Routing (Expo Router, file-based, see [app/](app/)):**
- `app/_layout.tsx` — Root layout. Holds the native splash screen via `SplashScreen.preventAutoHideAsync()`, runs Drizzle migrations on launch via `useMigrations(db, migrations)`, seeds mock cards (gated behind `__DEV__`), reads the `playInSilentMode` setting to configure `expo-audio`, then renders the `(tabs)` group and dismisses the splash.
- `app/(tabs)/_layout.tsx` — Tab navigator.
- `app/(tabs)/index.tsx` — **Library tab.** Defaults to the Folders view (Folders chip is first in the segmented control, matching the default selection); Cards is the alternate mode. Search, sort chips (frequency / A–Z / due), folder-filter chip (ActionSheetIOS picker), pull-to-refresh, gear icon → `/settings`.
- `app/(tabs)/study.tsx` — Global Study tab. Thin wrapper around `<StudySession>` (in `components/study-session.tsx`) using `useDueCards()`. **Front shows English translation, tap reveals German lemma + gender + example DE/EN + notes + Listen button.** Queue is snapshotted on first load so mid-session tab-switches don't shuffle it. Direction-aware: forward cards (`de_to_en`) and reverse siblings (`en_to_de`) both render with EN on front, DE on back.
- `app/study-folder/[slug].tsx` — Per-folder Study screen, same UI as the global tab. Mirrors `/folder/[slug]`'s sub query (`?sub=<id|null|all>`). Uses `useFolderDueCards` which filters the global due queue to cards with a sighting in matching photos PLUS their reverse siblings (by lemma). **Daily-new-cards quota is NOT applied** — drilling into a folder is a deliberate focused-study action, so all in-scope new cards surface. Resumption between visits is automatic because rated cards get scheduled forward by FSRS and don't reappear until due.
- `app/(tabs)/stats.tsx` — Card-state breakdown, totals, top-frequency lemmas, 12-week activity heatmap + current/longest streak, CSV export button.
- `app/(tabs)/capture.tsx` — `CameraView` + photo-library picker. Always routes the captured/picked URI to `/focus`; pipeline processing itself happens on the Focus screen.
- `app/focus.tsx` — Modal preview after every capture/library pick. Drag a rectangle on the photo, then choose **Scan selection** (sends the full image to Gemini with a normalized region hint so only words inside the rectangle get extracted, while category + rawText still see the whole photo) or **Scan whole image**. The file is NEVER cropped on disk — the saved photo is always the original. Sub-50/1000-unit selections are rejected with an alert.
- `app/scan/[id].tsx` — Post-capture results: per-word checkbox (default checked), uncheck words to remove from this scan; **Next** shows a batched alert offering [Just remove from scan / Add to ignore list / Cancel] when anything is unchecked, then `router.replace`s to `/scan-category/[id]`. Each removed sighting cascades to delete its card if no other sightings exist.
- `app/scan-category/[id].tsx` — Second step of the capture wizard. 2-column grid of all 12 category tiles + Uncategorized matching the Library Folders style. Currently-selected tile gets a 2.5px border + filled tint icon background + checkmark badge; the tile Gemini originally picked carries a "Gemini" badge so the user can see what they're changing. When the selected category is in `FOLDERS_WITH_SUBCATEGORIES`, the button reads **Next** and `router.replace`s to `/scan-subcategory/[id]?suggestion=<appName>` (Gemini's appName forwarded only when the user kept Gemini's category — otherwise the suggestion is stale and dropped). Otherwise the button reads **Save & Finish** and `router.dismissTo('/(tabs)')`. Reached via `router.replace` from scan results.
- `app/scan-subcategory/[id].tsx` — Third (and final) step of the capture wizard, reached only for parents in `FOLDERS_WITH_SUBCATEGORIES`. Renders tiles for: (a) a "Create new: <suggestion>" tile with a NEW badge when Gemini's appName has no existing match, (b) one tile per existing sub-category, (c) a "Skip" tile that leaves the photo without a sub-cat. On save: creates the new row via `createSubCategory` if applicable, then `setPhotoSubCategory`, then `router.dismissTo('/(tabs)')`. Pre-selects the photo's current `subCategoryId`, else the suggestion, else Skip.
- `app/card/[id].tsx` — Card detail with edit/sightings/notes. Three action buttons at the bottom in order: **Ignore** (amber outline — confirms, then writes the lemma to `ignored_words` first and deletes the card; ordering is deliberate so a failed delete still leaves the lemma flagged), **Delete card** (red outline — destructive delete only), **Create reverse** (tint outline — only shown when no sibling exists). Both Ignore and Delete `router.back()` to the previous screen rather than dumping to Library, so the user returns to the folder/Study/scan list they came from.
- `app/folder/[slug].tsx` — Three modes in one screen. (1) Parent without sub-cats → flat card list (current behavior). (2) Parent in `FOLDERS_WITH_SUBCATEGORIES` and no `sub` query → grid of sub-category tiles plus an "Uncategorized within this parent" tile when any photos have a null `sub_category_id`. An "All apps" tile prepends when there's more than one bucket (deduplicated card count). (3) Same parent with `?sub=<id>` (Uncategorized bucket = `?sub=null`, parent-wide = `?sub=all`) → flat card list filtered accordingly. The card-list mode renders a floating **Study** button at the bottom that pushes to `/study-folder/[slug]?sub=...` with the same filter.
- `app/photo/[id].tsx` — Full-screen photo viewer (modal). Folder chip for recategorization (ActionSheetIOS) + tappable bounding-box overlays per detected word → tap navigates to the card.
- `app/settings.tsx` — Daily new-card limit stepper, silent-mode toggle, **auto-play word on reveal toggle** (mirrored by the Flashcard-options modal in Study, opened via the header bell icon — both write the same `autoPlayWord` setting), auto-create-reverse-cards toggle, bulk-backfill-reverses button, link to ignored-words screen, and a **Danger zone** at the bottom with a red-outlined "Delete all cards" button (two-step confirmation showing the actual count, transactional delete of review logs + sightings + cards via `deleteAllCards`).
- `app/ignored.tsx` — Modal-presented list of ignored lemmas with per-row Remove buttons. Reached from Settings.

**Route registration:** new screens must be added to the `<Stack>` in `app/_layout.tsx`. Expo Router's typed routes don't pick up new files until `npx expo start` regenerates `.expo/types` — until then, cast as `'/route' as never` when calling `router.push`. Existing examples: `/settings`, `/folder/[slug]`, `/ignored`, `/focus`, `/scan-category/[id]`, `/scan-subcategory/[id]`, `/study-folder/[slug]`.

**Services ([services/](services/)):** orchestrators talk to native modules and the DB; pure helpers are extracted to dedicated files so they can be unit-tested without pulling in op-sqlite/expo-file-system/etc.
- `pipeline.ts` — Orchestrator. Resize image → Gemini Vision → stoplist filter → dedupe → `filterOutIgnored` against `ignored_words` → one `db.transaction` insert (photo + cards + sightings, with reverse-sibling auto-creation when the setting is on) → batched `COUNT(*) GROUP BY` for sighting counts.
- `pipeline-helpers.ts` — Pure `dedupeByLemma` (testable).
- `vision-helpers.ts` — Pure `sanitizeArticle(pos, lemma, gender)` (testable). Strips `der`/`die`/`das` from non-nouns; called by `vision.ts` as the belt-and-suspenders on top of the SYSTEM_PROMPT's CAPITALIZATION CHECK rule.
- `vision.ts` — Gemini 2.5 Flash. Resizes image to ≤1600px via `expo-image-manipulator` before base64. **`REQUEST_TIMEOUT_MS = 90_000`** with an `AbortSignal`. Tracks whether the timeout fired so the error surfaces as `"Request timed out after 90s"` (vs a generic `"Aborted"` from the SDK for other abort sources like network handoff or backgrounding). Retries once on network/5xx; does NOT retry on timeout. Asks Gemini for per-word `bbox` in `[ymin, xmin, ymax, xmax]` normalized to 0–1000. `analyzeImage(uri, { focusRegion })` accepts an optional region — when present, the user-prompt appends an instruction telling Gemini to only extract words whose bbox center is inside the region (while still classifying the whole image and transcribing all rawText). Also returns `appName: string | null` — populated only when category landed on `screenshots`.
- `scheduler.ts` — ts-fsrs (FSRS-6) wrapper. `emptyState()`, `review()`, `cardToState()`, `stateToCard()`.
- `review.ts` — `rateCard(id, rating)`. Update + log insert wrapped in one `db.transaction`.
- `card.ts` — Edit/delete card mutations + reverse-sibling helpers (`createReverseFor`, `bulkCreateReverses`, `findSibling`, `oppositeDirection`). Also `getCardCount()` and `deleteAllCards()` (one transaction: review logs → sightings → cards; photos/settings/ignore-list/sub-categories untouched). Used by the Settings Danger zone.
- `sighting.ts` — `removeSighting(id)` — one transaction that deletes the sighting and, if no others remain for its card, deletes the card too. Used by Scan Results "uncheck → Done".
- `ignored.ts` — Ignore-list CRUD over `ignored_words`: `addLemmasToIgnoreList`, `removeLemmaFromIgnoreList`, `getIgnoreList`, `filterOutIgnored`.
- `subcategory.ts` — CRUD over `sub_categories` (per-parent app tags): `getSubCategoriesFor`, `findSubCategoryByName` (case-insensitive via `lower()` on both sides — the index's `COLLATE NOCASE` is belt-and-suspenders), `createSubCategory` (race-safe via `onConflictDoNothing` + re-query), `setPhotoSubCategory`, `deleteSubCategory` (one transaction: null out referencing photos, then delete the row), `getSubCategorySummaries` (per-sub-cat photo + card counts plus an "Uncategorized within parent" bucket when populated), `getCardsForSubCategory` (cards filtered to `direction='de_to_en'` matching other library queries).
- `photo.ts` — `updatePhotoCategory(id, slug | null)` for the Photo viewer's folder chip.
- `export.ts` — CSV export orchestrator (DB + file write + iOS share sheet).
- `csv.ts` — Pure `buildCsv`, `csvEscape`, `stateLabel` (testable). Prepends UTF-8 BOM so Excel reads umlauts.
- `streaks.ts` — Pure `bucketByDay`, `computeStreaks`, `localDateKey` (testable). Powers the Stats activity heatmap.
- `bbox.ts` — Pure `parseBBox` (JSON → tuple), `containRect` (compute drawn rect for `contentFit="contain"`), `bboxToScreen` (normalized → screen px). Powers the Photo viewer overlay.
- `focus-crop.ts` — Pure helpers used by the Focus screen: `containerSelectionToNormalizedRegion` (container coords → Gemini-format `[ymin, xmin, ymax, xmax]` in 0–1000 space, clamped to the rendered image rect) is the one actually called today. `containerSelectionToImageCrop` / `padCropRect` / `isViableCrop` are kept around for the file-cropping approach we abandoned (sent the cropped image directly to Gemini, which broke scene classification) — only re-introduce them if that trade-off changes.
- `settings.ts` — `getSetting<T>` / `setSetting<T>` over the `settings` table.
- `speech.ts` — `speakGerman(text, options?)` wrapper around `expo-speech`. Options forward `onStart` / `onDone` / `onStopped` / `onError` callbacks so callers can drive UI state from real playback events (used by the StudySession's auto-play halo). Also exports `stopSpeech()` to cancel any in-flight utterance.
- `stoplist.ts` — POS-based filter + German function-word set.

**Hooks ([hooks/](hooks/)):** all data hooks are built on `useAsyncQuery` ([hooks/use-async-query.ts](hooks/use-async-query.ts)) which returns `{ loading, data, error, refetch }` and handles the `cancelled` flag + Promise-returning refetch. When adding a new data hook, use this helper rather than re-implementing the pattern.
- `use-cards.ts` — `useDueCards`, `useFolderDueCards(parentSlug, subId?)` (folder-scoped study queue — forwards with sightings in matching photos plus reverse siblings by lemma; daily-new quota is **not** applied — every in-scope due card surfaces), `useLibrary(sort, folderFilter?)`, `useCard(id)`, `useCardWithSibling(id)`, `useFrequencyRanking(limit)`, `useCardSightings(cardId)`, `useSightingsForPhoto(photoId)` (joins lemma + bbox for the photo overlay).
- `use-folders.ts` — `useFolders` (count by category), `useFolderCards(slug)`.
- `use-stats.ts` — `useStats` for the Stats tab (includes 84-day heatmap + streak counters).
- `use-scan.ts` — Joins photos × sightings × cards for the scan results screen.
- `use-settings.ts` — `useDailyNewCardLimit`, `usePlayInSilentMode`, `useAutoCreateReverseCards`, `useAutoPlayWord`, `useShuffleCards`. Boolean settings share `useBooleanSetting` internally — when adding another boolean setting, use that helper rather than copy-pasting the focus-effect dance.
- `use-ignored.ts` — `useIgnoredWords()` for the ignore-list management screen.
- `use-subcategories.ts` — `useSubCategoriesFor(parentSlug)` (flat list), `useSubCategorySummaries(parentSlug)` (counts + Uncategorized bucket — drives the `/folder/[slug]` sub-cat grid), `useSubCategoryCards(parentSlug, subId)` (cards within a sub-cat; `subId=null` = Uncategorized bucket).

**Shared components:**
- `components/study-session.tsx` — flippable card UI + FSRS rating buttons + optional "Seen often" rail. Used by both the global Study tab (`app/(tabs)/study.tsx`) and per-folder Study (`app/study-folder/[slug].tsx`). The hook supplying the queue is the only meaningful difference between them. The top header has a **bell icon** that opens a **Flashcard-options modal** (transparent backdrop, tap-out + explicit Done to dismiss) with two switch rows: Auto-play word (mirrors the `autoPlayWord` setting from main Settings) and Shuffle cards (the `shuffleCards` setting). When the back is revealed, the lemma auto-plays through `speakGerman` (gated by the setting, read via ref so a mid-card toggle doesn't interrupt in-flight audio) and a small inline speaker next to the lemma pulses a tint-colored halo while audio is playing (`Animated.loop` of opacity+scale on a 550ms cycle, `useNativeDriver: true`). The bottom Listen button plays only the example sentence and is hidden when the card has none. Swipe-to-rate is four-way: **left = Again, right = Good, up = Hard, down = Easy** (the overlay labels match the rating buttons). Dominant axis at release wins the commit, threshold ~120px; sub-threshold gestures spring back. The 4-button row at the bottom of the revealed card is still rendered for tap-to-rate. Shuffle takes effect at queue-snapshot time only — toggling mid-session does NOT reshuffle the in-flight queue (read via ref). The on-focus pruning effect removes deleted/ignored cards from `queue[index..]` after the user returns from card detail.

**State:** No global state library. Drizzle queries are the source of truth; hooks reload via `useFocusEffect`. Card sightings (for frequency) are computed by an extra SELECT — fine at our scale, swap to a window function or denormalized counter later if needed.

## Important Notes

- **iOS only.** No Android testing has been done. Always pass `--platform ios` to `eas build`, `eas submit`, and `eas update`. The `eas update` command in particular **must use `--platform ios`** — the default `--platform all` triggers a web/node bundle that imports `better-sqlite3` from op-sqlite and crashes the export.
- **Development builds with EAS** (not Expo Go). The app uses native modules (op-sqlite, expo-camera, expo-image-picker, expo-updates) that Expo Go doesn't include.
- **Gemini API key is build-time.** The `EXPO_PUBLIC_GEMINI_API_KEY` env var must exist as an EAS environment variable (`eas env:list production` to verify). Local `.env` only works for `npx expo start`; production builds get the key baked in from EAS. If a TestFlight build throws "EXPO_PUBLIC_GEMINI_API_KEY is not set", the EAS env var is missing or the build was made before it was added.
- **Two packages were removed for compatibility, do not re-add naively:**
  - `react-native-vision-camera` + `react-native-nitro-modules` — codegen race with Expo SDK 54 / RN 0.81 produces missing `NitroModulesSpec-generated.cpp` files. Replaced with `expo-camera`. Nitro modules have their own codegen path (`nitrogen`) that doesn't integrate with React Native codegen in this stack.
  - `@react-native-ml-kit/text-recognition` — Google ML Kit ships only x86_64 simulator slices and forces `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`. iOS 26 simulator on Apple Silicon is arm64-only and won't accept x86_64 binaries (Rosetta-for-iOS-Sim was removed in newer Xcode). ML Kit literally cannot run on a modern Mac simulator. Re-enable only if/when we build for physical iPhone exclusively and don't need simulator dev cycles.
- `metro.config.js` adds `'sql'` to `resolver.sourceExts` and `babel.config.js` uses `babel-plugin-inline-import` so Drizzle's generated SQL migrations load as strings.
- `runtimeVersion` is at the root of `app.config.ts` with `policy: 'appVersion'`. Each app version (`1.0.0`, `1.0.1`, ...) is a separate OTA channel — an OTA published to `1.0.0` won't reach a `1.0.1` installed binary.
- **EAS Update channels and branches are not the same thing.** `eas update --branch X` publishes to a branch. Builds query a channel. For updates to flow, a channel must exist that points to the branch. After the first build for a new profile, run `eas channel:create <profile-name>` if `eas channel:list` is empty.
- **Build profiles MUST set `"channel"` explicitly in `eas.json`.** `eas update:configure` is supposed to add this, but it bails on dynamic `app.config.ts` projects and leaves the channel unset. A build with no channel queries EAS Update without a channel parameter, silently misses every update, and the failure mode is invisible (no error, just no badge / no new bundle). Verify with `cat eas.json | grep channel` — every build profile that should receive updates needs it.
- `CocoaPods` requires `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` set in the shell or `pod install` errors with `Encoding::CompatibilityError` (Ruby 4 + CocoaPods 1.16). EAS Build handles this server-side; only matters if running `pod install` locally.
- Node is installed via `fnm`. Shell needs `eval "$(fnm env --shell zsh)"` before `node`/`npm`/`eas`/`expo` resolve. Add it to `~/.zshrc` so every interactive terminal has it; `~/.zshenv` if you need non-interactive shells (e.g. VS Code task runners) to find Node too.
- **`tsconfig.json` has `noUncheckedIndexedAccess: true`.** Array indexing returns `T | undefined`. When you write `arr[i]`, expect TS to flag uses that don't account for `undefined`. Prefer `arr[i]?.foo` or destructuring with defaults; use `arr[i]!` only when you've just bounds-checked.
- **Pure helpers go in dedicated files so they're testable.** Anything that doesn't need native modules (CSV builders, lemma dedup, FSRS conversions, stoplist checks, slug normalization) lives in its own file with a matching `__tests__/*.test.ts`. The convention is `services/<thing>-helpers.ts` or `services/<thing>.ts`. Orchestrators that touch the DB or native modules stay separate so their tests would need mocking.
- **CI runs on every push and PR** via [.github/workflows/ci.yml](.github/workflows/ci.yml): `npx tsc --noEmit`, `npm run lint`, `npm test`. Red status = something broke. Jest uses the `jest-expo` preset with `@/` path alias; jest globals (`describe`, `it`, `expect`, …) are scoped to `**/__tests__/**` and `*.test.ts(x)` in [eslint.config.js](eslint.config.js).
- **Drizzle's `text()` DSL doesn't emit `COLLATE NOCASE`.** If you need a case-insensitive unique key, primary key, or index, hand-edit the generated `.sql` migration file to append the collation. Examples: `0007_outgoing_selene.sql` (`ignored_words.lemma` PK) and `0008_shallow_plazm.sql` (`sub_categories_parent_name_nocase` unique index — `(parent_slug, name COLLATE NOCASE)`). The migration snapshot under `db/migrations/meta/` doesn't track collation, so the manual edit is safe and persistent — Drizzle won't try to "fix" it on the next generate.
- **Don't interpolate Drizzle column refs into raw `sql\`\`` templates for correlated subqueries.** Inside an `sql\`\`` chunk, `${cards.id}` renders as the **bare column name** `"id"`, not `"cards"."id"`. In an outer-query context that often works (the table is unambiguous), but in a subquery it silently breaks: SQLite's [double-quoted-identifier-to-string fallback](https://www.sqlite.org/quirks.html#double_quoted_string_literals_are_accepted) coerces unknown `"id"` to the string literal `'id'`, the correlation matches zero rows, and any downstream `ORDER BY` over the result fails opaquely (we saw this in `useFolderDueCards` for the folder-local frequency ranker — see comment there for the scene of the crime). Two safe patterns:
  1. **Prefer the query builder** — `.leftJoin(...)` with the predicate in the join clause, then `COUNT(joinedTable.id)` for "matched" counts. Drizzle qualifies every column itself. This is what `useFolderDueCards` does today.
  2. **If you must use `sql\`\``**, write the correlation identifier yourself: `sql\`s.card_id = "cards"."id"\``. Don't interpolate the column object — Drizzle won't qualify it for you in that position.
- **Study tab direction is English on front, German on tap-to-reveal** — this is the production-recall direction (harder, better for active recall) and is the user's preference. Reverse cards (`direction = 'en_to_de'`) and forward cards (`direction = 'de_to_en'`) both render with EN→DE in study mode; the data-level direction column exists for tracking + auto-create-sibling semantics, not for visual orientation.
- **Cloze deletion mode was tried and removed.** Don't re-pitch masked-sentence study without a meaningfully different design — the user feedback was that `Ich kaufe ___` carries no context to recall the missing word from.
- **Don't use `Colors[colorScheme].tint` for button text or fills on always-black/always-dark surfaces.** `tint` is `#0a7ea4` in light mode but **`#fff` (pure white) in dark mode** — pairing `backgroundColor: tint` with `color: 'white'` produces an invisible white-on-white button. This has bitten the focus screen and the folder Study button. The pattern for fixed-palette surfaces (camera overlay, focus modal, etc.) is to hardcode a palette that works on any background, OR to use `onTint = Colors[colorScheme].background` for text/icons on top of a `tint`-filled button (white text in light mode, black text in dark mode — both readable). The scan-results "Done" button is the canonical correct example.
- **The vision prompt's "German-only" filter is load-bearing — don't dilute it.** Without explicit instructions to reject non-German words, Gemini will happily extract English UI text (e.g. "Day", "Settings", "Profile") and *invent* German grammatical features for them (`der Day`, plural `Days`, made-up example sentences). The fix lives in the SYSTEM_PROMPT in `services/vision.ts`: a "CRITICAL: GERMAN-ONLY FILTER" block with concrete ❌/✓ examples. When editing the prompt, preserve those examples and the "false positives are worse than missed words" instruction — they're the parts that actually move the model. Screenshots are the worst offender because app UIs are usually English even on a German user's phone; the prompt explicitly flags this case.
- **Articles only go on nouns — capitalization is the diagnostic.** Gemini also occasionally stamps `der`/`die`/`das` on non-nouns (e.g. `das alles` — `alles` is an indefinite pronoun and never takes an article). The SYSTEM_PROMPT enforces this with a "CAPITALIZATION CHECK" rule (in standard German, nouns are ALWAYS capitalized in their dictionary form, so a lowercase lemma cannot be a noun) plus ❌/✓ examples for pronouns / adjectives / adverbs / infinitives. There's also a code-side `sanitizeArticle` belt-and-suspenders in `services/vision-helpers.ts` (tested in `__tests__/vision-helpers.test.ts`) — it strips `gender` from any word whose POS isn't `noun`/`propn` OR whose lemma starts lowercase, so a prompt regression doesn't end up in the DB. Indefinite pronouns like `alles` / `nichts` / `etwas` / `viele` are intentionally kept as flashcards (useful vocab) — they just get `gender=null`.

## Library Documentation

Use Context7 (`resolve-library-id` then `query-docs`) before writing non-trivial calls against any library — Drizzle, Expo, expo-router, React Native, ts-fsrs, op-sqlite, the Gemini SDK, etc. Don't rely on training data; the canonical failure is misremembering an ORM's query-builder overloads or an SDK's option shape. Fetch the docs first; pattern-match second. This applies even when you "know" the API — versions drift, and Context7 is the cheap diagnostic.

## OTA vs. Native Changes

This project uses EAS Update for OTA. After making code changes, tell the user if the change is a **native change** that requires a new EAS build (and TestFlight submission). If it's JS-only and can be pushed via `eas update --branch production --platform ios`, no need to mention it.

A change is native if running `npx expo prebuild` would modify the `ios/` folder. Examples:
- Adding/removing packages with native modules (e.g. `expo-camera`, `expo-image-picker`, `op-sqlite`)
- Upgrading Expo SDK, `react-native`, or `react-native-reanimated` major versions
- Changing `Info.plist`, entitlements, `bundleIdentifier`, or `infoPlist` keys
- Adding/changing Expo config plugins in `app.config.ts` (`expo-build-properties`, etc.)
- Touching `runtimeVersion` policy or the `updates.url`

**Whenever a change requires a new EAS build, also bump the app version** in `app.config.ts` (`version: '1.0.0' → '1.0.1'`). `runtimeVersion: { policy: 'appVersion' }` means the OTA bundle and the native build must agree on version — a native change without a version bump leaves the new build unable to receive future OTAs because the channel is mismatched.

JS-only changes (UI tweaks, prompt edits, FSRS scheduler wiring, new hooks, SQL queries via Drizzle, etc.) ship via `eas update --branch production --platform ios --message "<short past-tense summary>"`. No version bump needed.

**When a change is OTA-able, present the commit + OTA as a single bundled command** the user can copy-paste:

```bash
git add -A && git commit -m "<past-tense summary>" && eas update --branch production --platform ios --message "<short user-facing message>"
```

The user wants the OTA command pre-filled with the commit; don't make them ask for it.

## Edge Cases

For non-trivial changes (multi-step flows, state interactions, anything beyond a rename or single-line fix), briefly list the edge cases you considered at the end of the response — empty/missing inputs, ordering, what happens when the user cancels, what happens when data the feature depends on isn't there, what happens on a fresh install vs. an upgrade. Skip for trivial changes; a one-line fix doesn't need an edge-case section.

## Commit Messages

Whenever a response includes a code change, end the response with a `Commit Message:` line (or block, if multiple lines are needed) summarizing the change, ready to paste into `git commit`. Omit for pure questions, explanations, or no-op responses.

Use **past tense** verbs: "Added", "Fixed", "Removed", "Updated", "Restored" — not "Add", "Fix", "Remove", "Update", "Restore". Matches the existing history.

**Keep messages plain and concrete.** No "Tier 1", "Shipped", "Phase X" labels. No test-count footers, no marketing language, no bullet lists of files touched. Describe *what changed and (optionally) why* in one or two sentences. Examples from history:
- ✅ `"Bumped Gemini request timeout from 60 to 90 seconds."`
- ✅ `"Removed cloze deletion mode. The masked sentence didn't carry enough context to recall the missing word."`
- ❌ `"Shipped five Tier 1 OTA features: ..."` (too marketing)
- ❌ `"... New pure helpers ... with 19 new tests (72 total passing)."` (too verbose)
