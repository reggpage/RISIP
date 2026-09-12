import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.risip.app',
  appName: 'Risip',
  webDir: 'dist',
  android: {
    // Use the default mixed content mode so Supabase HTTPS calls work
    // alongside any HTTP resources.
    allowMixedContent: true,
    // Build for Android 7.0+ (minSdk 24 — required by the Camera plugin).
    minSdkVersion: 24,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#DD2D4A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#DD2D4A',
      overlaysWebView: false,
    },
    Camera: {
      // Allow high-quality receipt photos
      quality: 90,
    },
  },
};

export default config;