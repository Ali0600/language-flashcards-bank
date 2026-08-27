import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

import { DEFAULT_SETTINGS, getSetting, SettingKeys } from './settings';

let lastErrorAlertAt = 0;

/**
 * Voice identifier applied to every German utterance, or `null` to let iOS
 * choose. Held in a module-level cache rather than read per-utterance so
 * `speakGerman` stays synchronous (it's called from render-adjacent code
 * paths and from the Repeat loop, neither of which can await a DB read).
 *
 * Kept in sync by `initGermanVoice` on launch and `setGermanVoiceIdCached`
 * when the user picks one in Settings.
 */
let germanVoiceId: string | null = null;

/**
 * Load the persisted German voice and apply it — but only if that voice is
 * still installed on this device.
 *
 * The validation matters: downloaded Enhanced/Premium voices can disappear
 * across iOS upgrades, and passing a stale identifier to `Speech.speak` makes
 * iOS fail the utterance outright rather than falling back. Dropping an
 * unavailable id here degrades to the system default instead of going silent.
 *
 * We deliberately do NOT clear the stored setting when the voice is missing —
 * the user's choice should survive a re-download of the same voice.
 */
export async function initGermanVoice(): Promise<void> {
  try {
    const stored = await getSetting<string | null>(
      SettingKeys.germanVoiceId,
      DEFAULT_SETTINGS.germanVoiceId,
    );
    if (!stored) {
      germanVoiceId = null;
      return;
    }
    const voices = await Speech.getAvailableVoicesAsync();
    const stillInstalled = voices.some((v) => v.identifier === stored);
    if (!stillInstalled) {
      console.warn(
        `German voice ${stored} is no longer installed; falling back to the system default.`,
      );
    }
    germanVoiceId = stillInstalled ? stored : null;
  } catch (e) {
    // Never let voice resolution break speech entirely — worst case we speak
    // with the system default.
    console.warn('initGermanVoice failed; using the system default voice', e);
    germanVoiceId = null;
  }
}

/**
 * Apply a voice immediately without a round-trip through the DB read. The
 * Settings screen calls this alongside persisting the setting so the very
 * next utterance uses the new voice.
 */
export function setGermanVoiceIdCached(identifier: string | null): void {
  germanVoiceId = identifier;
}

/** The voice currently applied to German playback (mostly for tests/debug). */
export function getGermanVoiceIdCached(): string | null {
  return germanVoiceId;
}

function maybeAlertError(message: string) {
  const now = Date.now();
  if (now - lastErrorAlertAt < 5_000) return;
  lastErrorAlertAt = now;
  Alert.alert('Pronunciation unavailable', message);
}

export type SpeakOptions = {
  /** Fires when audio actually starts (after iOS' load delay). */
  onStart?: () => void;
  /** Fires on natural completion. NOT called when interrupted by `stopSpeech`. */
  onDone?: () => void;
  /** Fires when interrupted via `Speech.stop()`. Used to clear loading state cleanly. */
  onStopped?: () => void;
  /** Fires on synthesis error. */
  onError?: () => void;
};

export function speakGerman(text: string | null | undefined, options?: SpeakOptions): void {
  speakInLanguage(text, 'de-DE', options, /* errorHint */ 'German');
}

export function speakEnglish(text: string | null | undefined, options?: SpeakOptions): void {
  speakInLanguage(text, 'en-US', options, /* errorHint */ 'English');
}

/**
 * Speak a fixed German sample with an explicit voice, bypassing the cached
 * selection. Used by the Settings voice picker so a row can be auditioned
 * before (and right after) it's chosen.
 */
export function previewGermanVoice(identifier: string | null): void {
  stopSpeech();
  speakInLanguage(
    // Short, and deliberately loaded with the sounds that separate a good
    // German voice from a bad one: umlauts, the "ch" fricative, and a final
    // devoiced consonant.
    'Guten Morgen! Die Vögel singen schön.',
    'de-DE',
    undefined,
    'German',
    identifier,
  );
}

function speakInLanguage(
  text: string | null | undefined,
  language: 'de-DE' | 'en-US',
  options: SpeakOptions | undefined,
  errorHint: string,
  /**
   * Explicit voice override. When omitted, German playback uses the cached
   * user selection and English uses the system default. `null` means "system
   * default" and is distinct from omitting the argument.
   */
  voiceOverride?: string | null,
): void {
  if (!text) return;
  const voice =
    voiceOverride !== undefined ? voiceOverride : language === 'de-DE' ? germanVoiceId : null;
  try {
    Speech.speak(text, {
      language,
      pitch: 1,
      rate: 0.95,
      // Omit the key entirely when we have no voice — passing `undefined`
      // is fine for expo-speech, but this keeps the options object honest.
      ...(voice ? { voice } : {}),
      onStart: () => {
        console.log('speech:onStart', language, text.slice(0, 40));
        options?.onStart?.();
      },
      onDone: () => {
        console.log('speech:onDone', language);
        options?.onDone?.();
      },
      onStopped: () => {
        options?.onStopped?.();
      },
      onError: (e) => {
        console.error('speech:onError', language, e);
        maybeAlertError(
          `iOS could not play ${errorHint} speech. Check: ringer switch off (iPhone Silent toggle), volume up, and Settings → Accessibility → Spoken Content → Voices → ${errorHint} has a voice downloaded.`,
        );
        options?.onError?.();
      },
    });
  } catch (e) {
    console.error(`speak${errorHint} failed`, e);
    maybeAlertError(e instanceof Error ? e.message : String(e));
    options?.onError?.();
  }
}

/** Cancel any in-flight or queued utterance. Safe to call when nothing is playing. */
export function stopSpeech(): void {
  Speech.stop().catch((e) => console.warn('Speech.stop failed', e));
}
