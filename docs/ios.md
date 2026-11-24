# iOS app with Capacitor

Capacitor wraps the built web app (`dist/`) in a native iOS shell. The app has no server of its own: it calls the hosted API (Cloud Run, see `docs/deployment.md`) over HTTPS.

**Status.** The native project in `ios/` was generated and synced on Linux (`npx cap add ios`, `npm run ios:sync`). It has **never been opened in Xcode, built, or run on a simulator or phone**, because no Mac or Xcode was available. Treat everything below the "Tested here" list as unverified.

Tested here: the web build with an API address baked in; `cap sync`; the API client, bearer-token and CORS behaviour on the server; the reminder scheduling logic; no unhandled errors from the Capacitor storage calls under a fake native runtime.

## What you need

- A Mac with a current Xcode (Capacitor 8 uses Swift Package Manager, so no CocoaPods), and Node 24.
- An Apple Developer account for a bundle identifier, signing, and (later) TestFlight.
- The hosted API address from `docs/deployment.md` (it must be `https`: iOS blocks plain `http` to other hosts).

## First-time setup (on the Mac)

1. **Choose the bundle identifier** and set it in `capacitor.config.ts` (`appId`) before you go further. It is `com.example.takehomepharmacist` now, a placeholder. Then change it in Xcode too (target App > Signing & Capabilities) so the two match. Changing it later is awkward.
2. Create `.env.ios` from `.env.ios.example` and set `VITE_API_BASE_URL` to your service address (no trailing slash, no path).
3. Build and sync, then open Xcode:

   ```bash
   npm install
   npm run ios:sync      # builds the web app in "ios" mode, then copies it into ios/
   npm run ios:open
   ```

4. In Xcode, pick your Team under Signing, choose an iPhone simulator, and Run.

Re-run `npm run ios:sync` after every web change or API address change.

## Server settings the app needs

On Cloud Run set `CORS_ORIGINS=capacitor://localhost` (already in `deploy/cloudrun.yaml`). The app's pages come from that origin, which is different from the API's, so cookies cannot be used. Instead the app asks for a **bearer token** at sign-in and sends it with every request. The server returns that token only to clients that ask for it, never to the web app. It is stored in the app's own storage (Capacitor Preferences), not only in the web view, because iOS can clear web-view storage and a patient's access code works only once.

For testing against different servers without rebuilding, the sign-in page in the **native app only** has a "Server address (testing only)" box. It accepts `https://` addresses (and `http://` for localhost and private networks).

## How a patient gets in

1. The pharmacist approves the plan, then creates an access code (pharmacist workspace > Patient access). It is shown once as a QR code and as 20 characters.
2. **Today (no extra setup):** the patient scans the QR code with the phone camera, which opens the web version in Safari and signs them in. Inside the iOS app they type or paste the code at sign-in.
3. **Not done: opening the app directly from the QR code.** That needs Universal Links: an Associated Domains entitlement with your Apple Team ID, and an `apple-app-site-association` file served from your domain. Both need your Apple account, so they are left for you. Until then the QR code opens Safari, not the app.

## Behaviour to check in the simulator and on a device

| Check | Expect |
| --- | --- |
| Sign in with a typed code | Patient plan loads; closing and reopening the app keeps the patient signed in (until the session expires). |
| Sign out | Signs out, and cancels any scheduled reminders. |
| Chat, food check | Work; the emergency text appears for "I have chest pain". |
| Medication photos | Verified photos appear (they are fetched with the token). |
| Dose reminders | After "Turn on reminders" and allowing notifications, a notification arrives at each usual time, even with the app closed. It says "Time for your medicines" and never names a drug. Medicines taken more than once a day get no reminder; the screen says so. |
| Airplane mode | A clear "Could not reach the server" message, never a blank screen. |
| Dark mode, large text, VoiceOver | Readable and operable. |

Local notifications use `@capacitor/local-notifications` and have **not** been tried on a device.

## Decisions for you

- **Pharmacist sign-in in the app.** The same app contains the pharmacist workspace. If the App Store build should be patients only, hide the pharmacist tab in a native build. Not done.
- **Session length vs. single-use codes.** See the note in `docs/deployment.md`. A longer `PATIENT_SESSION_HOURS` means fewer new codes; a shorter one is safer on a lost phone.
- **App Store review.** Apple expects a way to sign in for review and a privacy policy; a medication-related app may be asked about its health claims. The in-app text already says it is not a pharmacist or medical advice. A reviewer account needs synthetic data only.

## TestFlight (later)

Needs your Apple Developer account, App Store Connect record, signing certificates, an app icon and launch screen (the generated ones are Capacitor placeholders), and device testing first. Archive in Xcode (Product > Archive) and upload.

## Notes for developers

- Never return or `await` a Capacitor plugin object from a helper function: it is a Proxy, so JavaScript calls `.then()` on it and it throws "not implemented". Destructure the plugin inside the function that calls it. A test (`tests/frontendUtils.test.ts`) guards against this.
- `isNativeApp()` (`src/utils/api.ts`) uses `window.Capacitor`, so the web build does not import native code until it is needed.
- Browser-only features were checked: `Notification` is feature-detected (iOS web views do not have it), `AudioContext` is guarded, clipboard needs a secure context (the app's `capacitor://` origin is one), and the pharmacist's `window.print()` is not part of the patient flow.
