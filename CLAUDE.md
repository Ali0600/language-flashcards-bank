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

## Architecture

**App name:** "Language Flashcards" (`expo.name`). German vocabulary learning via phone photos. Built with React Native + Expo SDK 54, distributed via EAS Build (production profile) + TestFlight, with EAS Update for OTA JS-only changes.

**Capture pipeline:** photo → Gemini Vision API → JSON of words (lemma, gender, POS, translation, example) → dedup by lemma → persist as cards + sightings in op-sqlite. There is no on-device OCR (ML Kit was removed; see Important Notes). Every photo goes straight to Gemini Vision.

**Data model (op-sqlite via Drizzle ORM, see [db/schema.ts](db/schema.ts)):**
- `photos` — id, takenAt, imageUri, rawOcrText, ocrSource
- `cards` — id, **lemma (unique, dedup key)**, gender (der/die/das/null), pos, translationEn, exampleDe, exampleEn, plural, plus flat FSRS state columns (due, stability, difficulty, reps, lapses, state, lastReview, learningSteps, elapsedDays, scheduledDays)
- `card_sightings` — id, cardId, photoId, surfaceForm, seenAt (one row per word-in-photo; `seen_count = COUNT(*)` derived)
- `review_logs` — id, cardId, rating, reviewedAt, plus FSRS snapshot fields for audit

**Frequency-suggestion query** (Library "by Frequency" sort + future Study suggested-next rail):
```sql
SELECT c.*, COUNT(s.id) AS freq
FROM cards c LEFT JOIN card_sightings s ON s.card_id = c.id
GROUP BY c.id ORDER BY freq DESC;
```

**Routing (Expo Router, file-based, see [app/](app/)):**
- `app/_layout.tsx` — Root layout. Runs Drizzle migrations on launch via `useMigrations(db, migrations)`, seeds 5 mock cards on first run, then renders the `(tabs)` group.
- `app/(tabs)/_layout.tsx` — Tab navigator. `unstable_settings.initialRouteName = 'library'` so the app opens to Library, not the live camera.
- `app/(tabs)/library.tsx` — Default tab. Lists all cards with sort modes (frequency, A–Z, due).
- `app/(tabs)/study.tsx` — Due cards with flip + Again/Hard/Good/Easy buttons. **Rating buttons are no-ops** until Phase 4 wires `services/scheduler.ts` in.
- `app/(tabs)/index.tsx` — Capture tab (rightmost). expo-camera live preview + shutter + photo-library picker.
- `app/scan/[id].tsx` — Post-capture results: each extracted word with NEW badge or sighting count.
- `app/card/[id].tsx` — Card detail: translation, example, FSRS state, list of source photo sightings.

**Services ([services/](services/)):**
- `pipeline.ts` — Orchestrates capture → vision → DB. Always uses `analyzeImage` from `vision.ts` since on-device OCR is stubbed out.
- `vision.ts` — Gemini 2.5 Flash with structured-output JSON schema; reads image as base64 via expo-file-system's new `File` API.
- `analyze.ts` — Text-only Gemini call for already-extracted words (currently unused; the pipeline always uses vision).
- `ocr.ts` — Stub. Returns "shouldUseLlm: true" so the pipeline falls through to vision. Will be re-enabled if/when we can run an on-device OCR alternative on simulator + device.
- `scheduler.ts` — ts-fsrs (FSRS-6) wrapper. `emptyState()`, `review()`, `cardToState()`, `stateToCard()`. Ready to wire into Study screen in Phase 4.
- `stoplist.ts` — POS-based filter (skip det/pron/num/propn/conj/etc.) + small German function-word set (`der/die/das/und/...`).

**Hooks ([hooks/](hooks/)):**
- `use-cards.ts` — `useDueCards()`, `useLibrary(sort)`, `useCard(id)`, `useCardSightings(cardId)`. All use `useFocusEffect` to reload on tab focus.
- `use-scan.ts` — `useScan(photoId)` joins photos × sightings × cards for the scan results screen.

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
- `CocoaPods` requires `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` set in the shell or `pod install` errors with `Encoding::CompatibilityError` (Ruby 4 + CocoaPods 1.16). EAS Build handles this server-side; only matters if running `pod install` locally.
- Node is installed via `fnm`. Shell needs `eval "$(fnm env --shell zsh)"` before `node`/`npm`/`eas`/`expo` resolve. Consider adding it to `~/.zshrc`.

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
