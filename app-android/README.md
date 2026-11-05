# Follow-Up for Android

This turns the web app in `../connect` into a real Android app (APK) using Capacitor.
Contacts are stored inside the app on the phone. There is no server.

What the Android app adds over the browser version:
- **Exact reminders:** a notification at your chosen time (Settings → Reminder time) on every
  follow-up date, even when the app is closed. Tapping it opens that contact.
- LinkedIn profiles, phone numbers and email links open in the LinkedIn, Phone and Gmail apps.
- Backups and messages use the Android share sheet (Drive, Gmail, WhatsApp, Files…).

## Getting the APK
Every push that changes `connect/` or `app-android/` runs the **Build Follow-Up Android app**
GitHub Action. It attaches `FollowUp.apk` to the release tagged `followup-android`.

On the phone: open the release page → tap **FollowUp.apk** → Open → allow "Install unknown apps"
for your browser when asked → Install. Later versions install over the top and keep your data.

## Signing (one-time setup, so updates keep your data)
Android only installs an update over the existing app if both builds were signed with the same key.
Add these four **repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FOLLOWUP_KEYSTORE_B64` | the keystore file, base64-encoded |
| `FOLLOWUP_KEYSTORE_PASSWORD` | keystore password |
| `FOLLOWUP_KEY_ALIAS` | key alias |
| `FOLLOWUP_KEY_PASSWORD` | key password |

Create a keystore with:

    keytool -genkeypair -keystore followup.keystore -alias followup -keyalg RSA -keysize 2048 -validity 10000
    base64 -w0 followup.keystore    # paste the output into FOLLOWUP_KEYSTORE_B64

Keep a private copy of the keystore and never commit it. Without the secrets the build still works,
but it's signed with a throwaway debug key. You'd then have to uninstall before each update, which
deletes the app's data, so export a backup first.

## Building locally (optional)
Needs Node 22, JDK 21 and the Android SDK.

    npm ci
    npm run sync                 # copies ../connect into the Android project
    cd android && ./gradlew assembleRelease
