# Language Flashcards

[![CI](https://github.com/Ali0600/language-flashcards-bank/actions/workflows/ci.yml/badge.svg)](https://github.com/Ali0600/language-flashcards-bank/actions/workflows/ci.yml)

Take a photo of German text. Get flashcards. Review with spaced repetition.

This is an iOS app built with React Native and Expo. Take a picture of anything with German on it: food packaging, a poster, a sign. Gemini Vision pulls out the words and analyzes each one (lemma, gender, part of speech, translation, example). The app turns them into flashcards scheduled by FSRS. Words that show up in several photos move to the top of your study queue.

## Features

- **Photo capture pipeline.** Camera + photo-library picker → Gemini 2.5 Flash → structured JSON of words → deduped flashcards. All in one tap.
- **Per-word checklist on Scan Results.** Uncheck any word you don't want as a flashcard. You can also add the unchecked lemmas to a persistent **Ignore List**, so future scans skip them. You manage the list from Settings.
- **Tappable bounding boxes on photos.** The photo viewer draws a box around each detected word. Gemini Vision returns the coordinates. Tap a box to jump straight to that card.
- **Auto-categorized folders, with recategorize.** Each photo goes into one of 12 scene categories (food packaging, cooking, household, signs, transport, health, documents, clothing, electronics, outdoor, screenshots, other). Wrong folder? Open the photo and pick another. The Library tab can group cards by folder, or filter the flat Cards view by folder.
- **Screenshots get app sub-folders.** When a photo lands in the Screenshots category, Gemini also names the app (Instagram, Twitter, Discord, etc.). The capture wizard adds a third step. There you confirm the suggestion, pick another existing app, or skip. In Library > Folders > Screenshots, the tile opens a grid of app sub-folders.
- **FSRS-6 spaced repetition.** The real algorithm via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), not a homegrown SM-2.
- **Study by folder or sub-folder.** Open any folder (or app sub-folder) and tap **Study** to review only those cards. Cards share their FSRS state with the global Study tab. Folder Study is just a filter, not a separate schedule. The daily new-card limit does NOT apply to folder Study, on purpose. Drilling in shows every card in scope.
- **Production-recall study direction.** The front shows the English translation. Tap to reveal the German lemma, gender and example sentences. This is the harder, more effective direction, and it is the default.
- **Four-way swipe-to-rate.** Swipe left for **Again**, right for **Good**, up for **Hard**, down for **Easy**. A four-color overlay (red/green/amber/blue) fades in as you drag past the threshold. The card flings off and the next one slides in from the opposite side. The 4-button row at the bottom still works for tap-to-rate.
- **Undo last rating.** A back-arrow button on the left of the Study header undoes the last rating. It walks you back to the card, restores its FSRS schedule and deletes the review log, all in one transaction. The undo stack lasts one session. The button is disabled when there is nothing to undo, or while a DB write is in flight.
- **Shuffle cards.** Toggle it in the Flashcard Options modal (bell icon, top-right of Study). Turn Shuffle ON inside the modal and the active queue reshuffles when you tap Done. Turn it OFF and the FSRS-due order comes back. Cards you have already rated stay put; only the upcoming part changes.
- **Re-analyze cards (folder audit).** Each folder card-list view has a "Re-analyze cards" button. It sends every card through Gemini in batches of 10. Results come in two tabs. **Corrections** lists per-issue checkboxes for lemma/gender/translation/example/plural fixes. They are pre-checked, and Apply commits them in one transaction. **Review** lists cards flagged as outside everyday vocabulary; tap one to open and delete it by hand. The audit also works as a **prompt-feedback loop**. When a re-analysis pass shows a class of mistake — for example, Gemini picked "caring" for `pflegend` on a hand-cream label when "nourishing" was the natural English — that is a signal to tighten the capture prompt (`services/vision.ts`) and the audit prompt (`services/audit.ts`). Future scans of the same domain then avoid the same miss. Each version of the prompt is shaped by what the audit finds on real cards.
- **Reverse cards (EN → DE) — optional.** A Settings toggle auto-creates an `en_to_de` sibling for every new card. You can also backfill all existing cards at once. Each direction keeps its own FSRS state.
- **Notes / mnemonics per card.** A free-text field on the card detail screen. It shows on the back of the card during study.
- **Frequency-weighted new cards.** When new cards enter your study queue, the ones you have seen most often in photos come first.
- **Daily new-card limit.** Set it in Settings (default 10/day), so one 30-word photo does not bury you. (Global Study tab only; folder Study ignores it.)
- **German pronunciation includes the article.** The moment you flip a card, it auto-plays `"der Tag"` (article + lemma) for nouns, and just the lemma for other words. The article carries the gender, which you cannot guess from spelling. Toggle it in Settings, or in the Flashcard Options modal in the Study header. An inline speaker icon next to the lemma replays on tap, with a pulsing halo. The Listen button at the bottom plays the example sentence. Audio plays through the silent switch by default.
- **Pick a better German voice.** iOS has higher-quality German voices (Enhanced and Premium tiers — "Anna" at Premium is the best of them), but it does not install them by default. That is why stock system speech sounds flat. Download one in iOS Settings → Accessibility → Spoken Content → Voices → German, then choose it in the app's Settings. Tap a voice to hear it right away. The list ranks Premium above Enhanced, and Enhanced above the basic compact voice. If a chosen voice is ever uninstalled, the app falls back to the system default.
- **Consistent translation format per POS.** Verbs use the `to <verb>` infinitive marker (`to save`, not `save`). Nouns are lowercase singular with no English article. Words tagged adj/adv/prep/conj/pron are lowercase with no prefix. Proper nouns keep their usual capitalization. The rules apply at capture time AND the audit feature flags older cards that break them.
- **Draft-on-back for scan results.** If you leave the scan-results screen without tapping Next, the app discards the captured photo, its cards and its sightings in one transaction. So re-scanning the same image does not double-count toward frequency.
- **Pull-to-refresh** wherever it makes sense.
- **CSV export** of every card, with sighting counts and FSRS state. Share it via the iOS share sheet.
- **Stats.** Card counts by state (New / Learning / Review / Relearning), total reviews, reviews today, photos taken and most-sighted lemmas. Plus a 12-week GitHub-style activity heatmap with current and longest streak counters.
- **Card editing.** Fix a wrong Gemini result right in the card detail screen.
- **Dark mode.**

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | iOS (iPhone, iPad-capable). No Android, no web. |
| Framework | [Expo SDK 54](https://docs.expo.dev/) + [React Native 0.81](https://reactnative.dev/) |
| Routing | [Expo Router](https://docs.expo.dev/router/introduction/) with typed routes |
| Database | [op-sqlite](https://github.com/OP-Engineering/op-sqlite) (JSI) + [Drizzle ORM](https://orm.drizzle.team/) |
| Spaced repetition | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-6) |
| Vision / NLP | [@google/genai](https://www.npmjs.com/package/@google/genai) — Gemini 2.5 Flash (free tier) |
| Camera | [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) |
| Image pipeline | [expo-image-manipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/) (resize before upload) |
| Speech | [expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/) + [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) (silent-switch override) |
| Storage | [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) (photos persisted under app's document directory) |
| Tests | [Jest](https://jestjs.io/) + [jest-expo](https://docs.expo.dev/guides/testing-with-jest/) |
| CI | GitHub Actions (tsc + ESLint + Jest on every push and PR) |
| Distribution | [EAS Build](https://docs.expo.dev/build/introduction/) (production profile) + [EAS Update](https://docs.expo.dev/eas-update/introduction/) OTA |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Capture tab  →  expo-camera  →  expo-image-manipulator     │
│                                  (resize to ≤1600px)        │
│                       │                                     │
│                       ▼                                     │
│                 Gemini 2.5 Flash                            │
│       (structured JSON: rawText + words[] + category)       │
│                       │                                     │
│                       ▼                                     │
│      services/pipeline.ts                                   │
│      ├─ Persist photo to document directory                 │
│      ├─ Apply stoplist (drop pronouns, articles, etc.)      │
│      ├─ Dedupe by lemma                                     │
│      └─ In one transaction:                                 │
│         • Insert photo row                                  │
│         • Insert any new cards (FSRS empty state)           │
│         • Insert sighting rows linking photo ↔ card         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Study tab  →  useDueCards()  →  ts-fsrs.next(card, rating) │
│  Rating writes a transaction:                               │
│    • Update card's FSRS state                               │
│    • Insert audit log row                                   │
└─────────────────────────────────────────────────────────────┘
```

### Data model (Drizzle, see [db/schema.ts](db/schema.ts))

- `photos` — id, taken_at, image_uri (local), raw_ocr_text, category (one of 12 fixed slugs), sub_category_id (an optional second dimension; today it is used only for Screenshots → specific apps)
- `cards` — id, lemma, gender, pos, translation, example DE/EN, plural, notes, **direction** (`de_to_en` | `en_to_de`), plus flat FSRS state columns. A compound unique key on `(lemma, direction)` lets a forward and a reverse card coexist
- `card_sightings` — one row per word-in-photo (cardId, photoId, surfaceForm, seenAt, **bbox** — JSON `[ymin, xmin, ymax, xmax]` normalized 0–1000, nullable)
- `review_logs` — the full FSRS audit trail, one row per rating
- `settings` — a JSON-serialized key/value store for `dailyNewCardLimit`, `playInSilentMode`, `autoCreateReverseCards`
- `ignored_words` — lemmas you chose to skip in future scans (case-insensitive primary key via `COLLATE NOCASE`)
- `sub_categories` — per-parent app/brand tags. Today they are scoped to `parent_slug='screenshots'` (Instagram, Twitter, Discord, etc.). Case-insensitive unique on `(parent_slug, name)`.

A card's frequency score is just `COUNT(*)` over its sightings. It is computed at query time, not stored.

### Routing

```
app/_layout.tsx          → root layout (migrations, seed, splash, audio mode, OTA check)
app/(tabs)/
  index.tsx              → Library (Cards / Folders view modes, folder filter)
  study.tsx              → Study (EN front, DE on tap-to-reveal, session queue snapshot)
  stats.tsx              → Stats + activity heatmap + streaks + CSV export
  capture.tsx            → Camera + photo library picker
app/card/[id].tsx        → Card detail (edit/delete, notes, reverse-sibling state)
app/folder/[slug].tsx    → Cards in a folder
app/photo/[id].tsx       → Full-screen photo viewer (modal) with bbox overlays + recategorize
app/scan/[id].tsx        → Post-capture results with per-word checkboxes
app/scan-category/[id].tsx     → Step 2 of capture wizard: confirm/change folder
app/scan-subcategory/[id].tsx  → Step 3 of capture wizard (Screenshots only): pick app
app/study-folder/[slug].tsx    → Per-folder Study (same UI as global Study, filtered queue)
app/settings.tsx         → Settings (modal)
app/ignored.tsx          → Ignored words list (modal)
```

## Setup

### Prerequisites

- Node 20+ (managed via [fnm](https://github.com/Schniz/fnm) — add `eval "$(fnm env --shell zsh)"` to `~/.zshrc`)
- Xcode and the iOS Simulator (or a registered physical iPhone)
- An [EAS account](https://expo.dev/) for cloud builds and OTAs
- A free [Google AI Studio](https://aistudio.google.com/) API key for Gemini

### First-time setup

```bash
npm ci
```

Set the Gemini key locally (for `npx expo start`):

```bash
echo 'EXPO_PUBLIC_GEMINI_API_KEY=<your-key>' > .env
```

For production builds, set it in EAS:

```bash
eas env:create production --name EXPO_PUBLIC_GEMINI_API_KEY --value <your-key> --type string
```

### Run locally

```bash
npx expo start --dev-client
```

You need a [development build](https://docs.expo.dev/develop/development-builds/introduction/) for this. The project uses native modules (op-sqlite, expo-camera, expo-speech) that Expo Go does not include. To make a dev build for the simulator:

```bash
eas build --profile development --platform ios
```

Install the resulting `.app` in the iOS Simulator. Then run `npx expo start --dev-client` to attach Metro.

## Development workflow

### Common commands

| Command | What it does |
|---|---|
| `npx expo start --dev-client` | Start Metro for the dev build |
| `npx expo start --dev-client --clear` | Same, but clear Metro's cache |
| `npm test` | Run Jest unit tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run lint` | ESLint (via `expo lint`) |
| `npx tsc --noEmit` | Type-check without emitting |
| `npx drizzle-kit generate` | Regenerate SQL migrations after a `db/schema.ts` change |
| `eas build --profile production --platform ios` | Cloud build for TestFlight |
| `eas submit --platform ios --profile production --latest` | Upload latest build to App Store Connect |
| `eas update --branch production --platform ios --message "..."` | OTA push (JS-only changes) |

### OTA vs. native rebuilds

A change is **native** if it would change `ios/` after `npx expo prebuild`:

- Adding or removing native modules
- Changing `Info.plist`, entitlements, `bundleIdentifier`, or `infoPlist` keys
- Adding or changing Expo config plugins
- Upgrading Expo SDK or React Native majors

A native change needs a new EAS build and a TestFlight install. **Always bump the version in `app.config.ts`** when you ship a native change. `runtimeVersion: { policy: 'appVersion' }` means each version is its own OTA channel.

Everything else ships via `eas update --branch production --platform ios`: UI tweaks, prompt edits and schema migrations. (Drizzle migrations are bundled into the JS by [babel-plugin-inline-import](https://www.npmjs.com/package/babel-plugin-inline-import).) **Always pass `--platform ios`.** The default `--platform all` crashes, because op-sqlite's web fallback imports `better-sqlite3`.

### Testing

Pure helpers live in single-purpose modules (`services/csv.ts`, `services/pipeline-helpers.ts`, `services/stoplist.ts`, etc.). That way you can unit-test them without loading native modules. Tests sit next to the source:

```
services/__tests__/
  bbox.test.ts
  csv.test.ts
  pipeline-helpers.test.ts
  scheduler.test.ts
  stoplist.test.ts
  streaks.test.ts
constants/__tests__/
  folders.test.ts
```

Screen and integration tests are not worth the mocking cost in this codebase. TypeScript, ESLint and the pure-helper tests catch most regressions.

### Project structure

```
app/                     Expo Router screens (file-based routing)
components/              Themed primitives, IconSymbol
constants/               Theme tokens, folder slug → label mapping
db/                      Drizzle schema, client, migrations, seed
hooks/                   Data-loading hooks (all built on useAsyncQuery)
lib/                     Tiny utilities (env, shared types)
services/                Pipeline, vision, scheduler, review, settings, etc.
assets/                  Icons, splash, fonts
.github/workflows/ci.yml  Lint + tsc + Jest on push and PR
CLAUDE.md                Project conventions and gotchas (read first)
```

## Status

- iOS-only, internal TestFlight (no external testers, no App Store release planned)
- Runtime `1.0.3`, Build #8
- Shipped via EAS Build + OTA on the `production` channel
- The bundled Gemini key is fine for personal use. If the app is ever shared outside, route calls through a server-side proxy (a Cloudflare Worker is the planned approach)

## Experience Gained

- Built an iOS app on Expo SDK 54 and React Native 0.81 with 15 Expo Router screens, op-sqlite, and Drizzle ORM with 9 generated migrations bundled into the JS at build time.
- Wired Gemini 2.5 Flash through `@google/genai` to turn photos into structured JSON: images shrink to at most 1600px before upload, and a re-analysis audit sends cards in batches of 10.
- Scheduled reviews with the FSRS algorithm via `ts-fsrs` ^5.3.2, with a default daily new-card limit of 10 and a repeat-playback loop you can set from 1 to 10 times.
- Ranked iOS German voices in 3 tiers (Premium > Enhanced > compact) by parsing Apple's voice identifiers, because the Expo enum labels Premium voices as Default.
- Gated every push and PR with 3 CI checks on GitHub Actions (`tsc`, ESLint, 148 Jest unit tests across 12 files), with both actions SHA-pinned and `permissions: contents: read`.
- Shipped through EAS Build and EAS Update OTA: 4 build profiles in `eas.json` and a runtime version tied to the app version (`1.0.3`), so JS-only changes and schema migrations reach the phone without a rebuild.

## License

Personal project. Not licensed for redistribution.
