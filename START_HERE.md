# Nina source bundle

Includes the published private web app and the current React Native Android source. The Android release build is still in progress; this ZIP does not contain an APK.

Web dashboard: https://nina-control-room.mohammedkhasiminfo.chatgpt.site

Android: install Node 22.11+ and JDK 17, set up Android SDK, run npm ci in android-app. Create android/local.properties with your sdk.dir. For release, generate your own signing keystore and set NINA_KEYSTORE and NINA_STORE_PASSWORD, then run ./gradlew assembleRelease from android-app/android. Never commit a signing key or password.

Phone login uses a one-time code from the owner's Security page, followed by Android device confirmation. Tokens and model keys remain on the server. No production credentials, database messages or signing secrets are included in this bundle.

Timing configuration is currently 15 minutes active / 60 minutes resting. Editable duration controls are the next change.
