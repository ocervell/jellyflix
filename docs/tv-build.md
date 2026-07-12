# Android TV / Fire TV build

The APK bundles the web app (`webDir: 'dist'`) and runs it in a Capacitor
WebView. On first run the app shows a **server screen** — the user enters their
Jellyfin URL (e.g. `http://192.168.1.10:8096`), which is validated against
`/System/Info/Public` and saved; a "Change server" link on the login screen
resets it. D-pad navigation is handled by the web app's spatial navigation.
Build on a machine with Android Studio + SDK.

`capacitor.config.ts` sets `server.androidScheme: 'http'` (so plain-http LAN
Jellyfin isn't blocked as mixed content) and enables the `CapacitorHttp` plugin
(so the app's fetch/XHR go through native HTTP, bypassing browser CORS on the
direct Jellyfin calls). There is **no** remote `server.url` — the assets are
bundled and the server is chosen in-app.

## One-time
    npm i -D @capacitor/cli
    npm i @capacitor/core @capacitor/android
    npx cap add android

## After the android/ project exists, apply the TV manifest edits
In `android/app/src/main/AndroidManifest.xml`:
- On the main `<activity>`, add a second intent-filter category so it shows on the TV home:
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
      </intent-filter>
- In `<manifest>`, declare TV-friendly features:
      <uses-feature android:name="android.software.leanback" android:required="false" />
      <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
- On `<application>` add a TV banner (320×180 drawable): android:banner="@drawable/banner"

## Build + install
    npx cap sync
    # open android/ in Android Studio → Build > Build APK, or:
    cd android && ./gradlew assembleDebug
    adb connect <TV-IP>:5555 && adb install app/build/outputs/apk/debug/app-debug.apk

## Notes
- The remote Back button is delivered to the web app; the global Back handler
  (src/lib/tv/back.tsx) resolves it (menu → modal → player → history → exit).
- To update the app, rebuild `dist` (`npm run build`), `npx cap sync`, and
  reinstall the APK — the web assets are bundled, not loaded from a URL.
- The saved server lives in the WebView's localStorage (`jellyflix.server`);
  "Change server" on the login screen clears it.

## Hardware Back button bridge
On Android, the hardware/remote Back button fires Capacitor's `App`
`backButton` event, NOT a DOM `keydown`. The web back-stack
(`src/lib/tv/back.tsx`) only listens for `keydown` (Escape), so without a
bridge the hardware Back button does nothing in the WebView. Bridge it once
at app init:

    import { App } from '@capacitor/app';
    App.addListener('backButton', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

Requires `npm i @capacitor/app`.
