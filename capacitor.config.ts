import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Capacitor packages the static Next.js export (`out/`) into native
 * Android/iOS shells. No server runs on the device: every route is a
 * pre-rendered HTML file served from the app bundle.
 */
const config: CapacitorConfig = {
  appId: "com.uniflow.app",
  appName: "Flowed",
  webDir: "out",
  android: {
    // Keep WebView data (IndexedDB fallback, localStorage prefs) across updates.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      // Hidden from JS once the database is open (see native-bridge.tsx).
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#F7F7FB",
      showSpinner: false,
    },
    Keyboard: {
      // Resize the WebView so focused inputs stay above the keyboard.
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_uniflow",
      iconColor: "#4F46E5",
    },
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;
