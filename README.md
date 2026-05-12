# Language Flashcards

[![CI](https://github.com/Ali0600/language-flashcards-bank/actions/workflows/ci.yml/badge.svg)](https://github.com/Ali0600/language-flashcards-bank/actions/workflows/ci.yml)

Take a photo of German text. Get flashcards. Review with spaced repetition.

iOS app built with React Native + Expo. Snap a picture of food packaging, a poster, a sign, anything with German on it — Gemini Vision extracts the words, analyzes them (lemma, gender, part of speech, translation, example), and turns them into FSRS-scheduled flashcards. Words seen in multiple photos rise to the top of the study queue.

## Features

- **Photo capture pipeline.** Camera + photo-library picker → Gemini 2.5 Flash → structured JSON of words → deduped flashcards. All in one tap.
- **Auto-categorized folders.** Each photo is classified into one of 11 scene categories (food packaging, cooking, household, signs, transport, health, documents, clothing, electronics, outdoor, other). The Library tab can group cards by folder so you can browse "everything I saw on a recipe card."
- **FSRS-6 spaced repetition.** Real algorithm via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), not a homegrown SM-2.
- **Frequency-weighted new cards.** When new cards drip into your study queue, the ones you've actually seen most often in photos come first.
- **Daily new-card limit.** Tunable in Settings (default 10/day) so a single 30-word photo doesn't bury you.
- **German pronunciation.** Tap to hear the word and an example sentence via iOS's native speech synthesizer. Plays through the silent switch by default (toggleable in Settings).
- **Pull-to-refresh** everywhere it makes sense.
- **CSV export** of every card with sighting counts and FSRS state — shareable via the iOS share sheet.
- **Stats.** Card counts by state (New / Learning / Review / Relearning), total reviews, reviews today, photos taken, most-sighted lemmas.
- **Card editing.** Fix a misclassification from Gemini directly in the card detail screen.
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

- `photos` — id, taken_at, image_uri (local), raw_ocr_text, category (one of 11 fixed slugs)
- `cards` — id, **lemma (unique)**, gender, pos, translation, example, plural, plus flat FSRS state columns
- `card_sightings` — one row per word-in-photo (cardId, photoId, surfaceForm, seenAt)
- `review_logs` — full FSRS audit trail per rating
- `settings` — JSON-serialized key/value store for `dailyNewCardLimit`, `playInSilentMode`

A card's frequency score is just `COUNT(*)` over its sightings — computed at query time, not denormalized.

### Routing

```
app/_layout.tsx          → root layout (migrations, seed, splash, audio mode, OTA check)
app/(tabs)/
  index.tsx              → Library (Cards / Folders view modes)
  study.tsx              → Study (with session queue snapshot)
  stats.tsx              → Stats + CSV export
  capture.tsx            → Camera + photo library picker
app/card/[id].tsx        → Card detail (with edit/delete)
app/folder/[slug].tsx    → Cards in a folder
app/photo/[id].tsx       → Full-screen photo viewer (modal)
app/scan/[id].tsx        → Post-capture results
app/settings.tsx         → Daily-limit stepper + silent-mode toggle (modal)
```

## Setup

### Prerequisites

- Node 20+ (managed via [fnm](https://github.com/Schniz/fnm) — add `eval "$(fnm env --shell zsh)"` to `~/.zshrc`)
- Xcode + iOS Simulator (or a registered physical iPhone)
- An [EAS account](https://expo.dev/) (for cloud builds and OTAs)
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

This requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) — the project uses native modules (op-sqlite, expo-camera, expo-speech) that Expo Go doesn't include. To produce a dev build for the simulator:

```bash
eas build --profile development --platform ios
```

Install the resulting `.app` in the iOS Simulator, then `npx expo start --dev-client` to attach Metro.

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

A change is **native** if it would modify `ios/` after `npx expo prebuild`:

- Adding/removing native modules
- Changing `Info.plist`, entitlements, `bundleIdentifier`, or `infoPlist` keys
- Adding/changing Expo config plugins
- Upgrading Expo SDK or React Native majors

Native changes require a new EAS build + TestFlight install. **Always bump the version in `app.config.ts`** when shipping a native change — `runtimeVersion: { policy: 'appVersion' }` means each version is its own OTA channel.

Anything else — UI tweaks, prompt edits, schema migrations (Drizzle migrations bundle into the JS via [babel-plugin-inline-import](https://www.npmjs.com/package/babel-plugin-inline-import)) — ships via `eas update --branch production --platform ios`. **Always pass `--platform ios`** — the default `--platform all` crashes because op-sqlite's web fallback imports `better-sqlite3`.

### Testing

Pure helpers live in single-purpose modules (`services/csv.ts`, `services/pipeline-helpers.ts`, `services/stoplist.ts`, etc.) so they can be unit-tested without pulling in native modules. Tests live next to the source:

```
services/__tests__/
  csv.test.ts
  pipeline-helpers.test.ts
  scheduler.test.ts
  stoplist.test.ts
constants/__tests__/
  folders.test.ts
```

Screen and integration tests aren't worth the mocking cost in this codebase — TypeScript + ESLint + the pure-helper tests catch most regressions.

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
- Runtime `1.0.2`, Build #7
- Distributed via EAS Build + OTA on the `production` channel
- The bundled Gemini key works for personal use; if external sharing ever happens, route through a server-side proxy (Cloudflare Worker is the planned approach)

## License

Personal project. Not licensed for redistribution.
