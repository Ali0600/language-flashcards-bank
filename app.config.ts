import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Language Flashcards',
  slug: 'language-flashcards-bank',
  version: '1.0.2',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'languageflashcardsbank',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  updates: {
    url: 'https://u.expo.dev/1dc06005-2b36-46e6-b68c-b8db79ceafe9',
  },
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.languageflashcardsbank.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Language Flashcards needs camera access to capture photos of German text for vocabulary extraction.',
      NSPhotoLibraryUsageDescription:
        'Language Flashcards reads photos from your library to extract German vocabulary.',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#000000' },
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '15.5' },
      },
    ],
    'expo-audio',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: '1dc06005-2b36-46e6-b68c-b8db79ceafe9',
    },
  },
  owner: 'mhassan0600',
};

export default config;
