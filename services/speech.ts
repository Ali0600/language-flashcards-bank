import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

let lastErrorAlertAt = 0;

function maybeAlertError(message: string) {
  const now = Date.now();
  if (now - lastErrorAlertAt < 5_000) return;
  lastErrorAlertAt = now;
  Alert.alert('Pronunciation unavailable', message);
}

export function speakGerman(text: string | null | undefined): void {
  if (!text) return;
  try {
    Speech.speak(text, {
      language: 'de-DE',
      pitch: 1,
      rate: 0.95,
      onStart: () => console.log('speech:onStart', text.slice(0, 40)),
      onDone: () => console.log('speech:onDone'),
      onError: (e) => {
        console.error('speech:onError', e);
        maybeAlertError(
          'iOS could not play German speech. Check: ringer switch off (iPhone Silent toggle), volume up, and Settings → Accessibility → Spoken Content → Voices → German has a voice downloaded.',
        );
      },
    });
  } catch (e) {
    console.error('speakGerman failed', e);
    maybeAlertError(e instanceof Error ? e.message : String(e));
  }
}
