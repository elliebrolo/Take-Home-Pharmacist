import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web app (dist/) in a native iOS shell. The shell has no server of its own: the app
 * calls the hosted API (Cloud Run) at the address baked in with VITE_API_BASE_URL, see docs/ios.md.
 *
 * appId is a PLACEHOLDER. Replace it with the bundle identifier you register in your Apple Developer account
 * BEFORE the first `npx cap add ios`/Xcode signing: it is awkward to change afterwards.
 */
const config: CapacitorConfig = {
  appId: 'com.example.takehomepharmacist',
  appName: 'Take-Home Pharmacist',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    // The app only ever talks to its own API and to DailyMed images; it never browses arbitrary sites.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
