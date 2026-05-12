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
- `photos` — id, takenAt, imageUri, rawOcrText, category (one of 11 fixed folder slugs or null for legacy rows)
- `cards` — id, **lemma (unique, dedup key)**, gender (der/die/das/null), pos, translationEn, exampleDe, exampleEn, plural, plus flat FSRS state columns (due, stability, difficulty, reps, lapses, state, lastReview, learningSteps, elapsedDays, scheduledDays)
- `card_sightings` — id, cardId, photoId, surfaceForm, seenAt (one row per word-in-photo; `seen_count = COUNT(*)` derived)
- `review_logs` — id, cardId, rating, reviewedAt, plus FSRS snapshot fields for audit
- `settings` — key/value/updatedAt, JSON-serialized values; keys are `dailyNewCardLimit`, `playInSilentMode`

**Frequency-suggestion query** (Library "by Frequency" sort + future Study suggested-next rail):
```sql
SELECT c.*, COUNT(s.id) AS freq
FROM cards c LEFT JOIN card_sightings s ON s.card_id = c.id
GROUP BY c.id ORDER BY freq DESC;
```

**Routing (Expo Router, file-based, see [app/](app/)):**
- `app/_layout.tsx` — Root layout. Holds the native splash screen via `SplashScreen.preventAutoHideAsync()`, runs Drizzle migrations on launch via `useMigrations(db, migrations)`, seeds mock cards (gated behind `__DEV__`), reads the `playInSilentMode` setting to configure `expo-audio`, then renders the `(tabs)` group and dismisses the splash.
- `app/(tabs)/_layout.tsx` — Tab navigator.
- `app/(tabs)/index.tsx` — **Library tab.** Cards / Folders view-mode toggle, search, sort chips (frequency / A–Z / due), pull-to-refresh, gear icon → `/settings`.
- `app/(tabs)/study.tsx` — Due-cards study. Snapshots the queue locally on first load so mid-session tab-switches don't shuffle it. "Start over" calls `refetch()` to pull a fresh queue.
- `app/(tabs)/stats.tsx` — Card-state breakdown, totals, top-frequency lemmas, CSV export button.
- `app/(tabs)/capture.tsx` — `CameraView` (paused during processing) + photo-library picker.
- `app/scan/[id].tsx` — Post-capture results: each extracted word with NEW badge or sighting count.
- `app/card/[id].tsx` — Card detail with edit/delete, sighting list, listen button.
- `app/folder/[slug].tsx` — Cards belonging to a single folder category.
- `app/photo/[id].tsx` — Full-screen photo viewer (modal).
- `app/settings.tsx` — Daily new-card limit stepper + silent-mode toggle (modal).

**Services ([services/](services/)):** orchestrators talk to native modules and the DB; pure helpers are extracted to dedicated files so they can be unit-tested without pulling in op-sqlite/expo-file-system/etc.
- `pipeline.ts` — Orchestrator. Resize image → Gemini Vision → filter + dedupe → one `db.transaction` insert (photo + cards + sightings) → batched `COUNT(*) GROUP BY` for sighting counts.
- `pipeline-helpers.ts` — Pure `dedupeByLemma` (testable).
- `vision.ts` — Gemini 2.5 Flash. Resizes image to ≤1600px via `expo-image-manipulator` before base64, passes an `AbortSignal` with a 30s timeout, retries once on network/5xx.
- `scheduler.ts` — ts-fsrs (FSRS-6) wrapper. `emptyState()`, `review()`, `cardToState()`, `stateToCard()`.
- `review.ts` — `rateCard(id, rating)`. Update + log insert wrapped in one `db.transaction`.
- `card.ts` — Edit/delete card mutations.
- `export.ts` — CSV export orchestrator (DB + file write + iOS share sheet).
- `csv.ts` — Pure `buildCsv`, `csvEscape`, `stateLabel` (testable). Prepends UTF-8 BOM so Excel reads umlauts.
- `settings.ts` — `getSetting<T>` / `setSetting<T>` over the `settings` table.
- `speech.ts` — `speakGerman(text)` wrapper around `expo-speech`.
- `stoplist.ts` — POS-based filter + German function-word set.

**Hooks ([hooks/](hooks/)):** all data hooks are built on `useAsyncQuery` ([hooks/use-async-query.ts](hooks/use-async-query.ts)) which returns `{ loading, data, error, refetch }` and handles the `cancelled` flag + Promise-returning refetch. When adding a new data hook, use this helper rather than re-implementing the pattern.
- `use-cards.ts` — `useDueCards`, `useLibrary(sort)`, `useCard(id)`, `useFrequencyRanking(limit)`, `useCardSightings(cardId)`.
- `use-folders.ts` — `useFolders` (count by category), `useFolderCards(slug)`.
- `use-stats.ts` — `useStats` for the Stats tab.
- `use-scan.ts` — Joins photos × sightings × cards for the scan results screen.
- `use-settings.ts` — `useDailyNewCardLimit`, `usePlayInSilentMode`.

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

## Edge Cases

For non-trivial changes (multi-step flows, state interactions, anything beyond a rename or single-line fix), briefly list the edge cases you considered at the end of the response — empty/missing inputs, ordering, what happens when the user cancels, what happens when data the feature depends on isn't there, what happens on a fresh install vs. an upgrade. Skip for trivial changes; a one-line fix doesn't need an edge-case section.

## Commit Messages

Whenever a response includes a code change, end the response with a `Commit Message:` line (or block, if multiple lines are needed) summarizing the change, ready to paste into `git commit`. Omit for pure questions, explanations, or no-op responses.

Use **past tense** verbs: "Added", "Fixed", "Removed", "Updated", "Restored" — not "Add", "Fix", "Remove", "Update", "Restore". Matches the existing history.
