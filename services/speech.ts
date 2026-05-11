import * as Speech from 'expo-speech';

export function speakGerman(text: string | null | undefined): void {
  if (!text) return;
  try {
    Speech.stop();
    Speech.speak(text, {
      language: 'de-DE',
      pitch: 1,
      rate: 0.95,
    });
  } catch (e) {
    console.error('speakGerman failed', e);
  }
}
