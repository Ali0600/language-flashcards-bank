import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'language-flashcards-bank',
  slug: 'language-flashcards-bank',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'languageflashcardsbank',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
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
  android: {
    package: 'com.languageflashcardsbank.app',
    permissions: ['android.permission.CAMERA', 'android.permission.READ_EXTERNAL_STORAGE'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
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
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
