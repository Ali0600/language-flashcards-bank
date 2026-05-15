import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

let lastErrorAlertAt = 0;

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
  if (!text) return;
  try {
    Speech.speak(text, {
      language: 'de-DE',
      pitch: 1,
      rate: 0.95,
      onStart: () => {
        console.log('speech:onStart', text.slice(0, 40));
        options?.onStart?.();
      },
      onDone: () => {
        console.log('speech:onDone');
        options?.onDone?.();
      },
      onStopped: () => {
        options?.onStopped?.();
      },
      onError: (e) => {
        console.error('speech:onError', e);
        maybeAlertError(
          'iOS could not play German speech. Check: ringer switch off (iPhone Silent toggle), volume up, and Settings → Accessibility → Spoken Content → Voices → German has a voice downloaded.',
        );
        options?.onError?.();
      },
    });
  } catch (e) {
    console.error('speakGerman failed', e);
    maybeAlertError(e instanceof Error ? e.message : String(e));
    options?.onError?.();
  }
}

/** Cancel any in-flight or queued utterance. Safe to call when nothing is playing. */
export function stopSpeech(): void {
  Speech.stop().catch((e) => console.warn('Speech.stop failed', e));
}
