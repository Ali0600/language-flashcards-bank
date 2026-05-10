export const env = {
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
};

export function assertGeminiKey(): string {
  if (!env.geminiApiKey) {
    throw new Error(
      'EXPO_PUBLIC_GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in.',
    );
  }
  return env.geminiApiKey;
}
