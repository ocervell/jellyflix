# Android TV / Fire TV build

The APK is a thin Capacitor WebView that loads the deployed Jellyflix URL
(set in `capacitor.config.ts` → `server.url`). D-pad navigation is handled by
the web app's spatial navigation. Build on a machine with Android Studio + SDK.

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
- To update the app, just redeploy the web app — the wrapper reloads server.url.
