# Separate native Expo applications

The repository contains two React Native applications on Expo SDK 58. Neither renders the website inside a WebView.

| Application | Source | Android package | Access |
| --- | --- | --- | --- |
| Nina Control Room | `expo-app` | `com.nina.controlroom` | Existing master owner account |
| Business Workspace | `business-expo-app` | `com.business.workspace` | Business registration and business accounts |

Both applications use the existing production origin `https://automation.ninakurainservices.in`. The hostname necessarily remains visible in network requests; the business application does not contain private admin screen code or admin endpoint references. Private routes require server authorization independently of their names.

## Features

- Admin: Instagram overview, inbox and reply drafts, manual delivery, takeover, personality and automation, provider setup/testing/activation, shared routing, Instagram connections, business creation and suspension, workspace inspection, registered users, paginated sessions/activity, session revocation and usage.
- Business: login/registration, required profile setup with explanations, conversations and approvals, manual replies/takeover, catalog editing, orders/statuses, AI controls and keyword rules, saved-settings previews, WhatsApp QR connection, usage, queue retry and activity.
- Shared native components use a light purple, white and slate palette, safe areas, keyboard handling, readable system fonts, loading/error states, named workspaces, confirmation for destructive actions, pull-to-refresh and foreground refresh.
- Backgrounding conceals the workspace. Returning to the foreground revalidates the saved session. Sessions are revocable on the server and stored with Expo SecureStore under separate app keys. Passwords and provider keys are not persisted on the phone.
- The business entry imports only generic business screens. Provider credentials and cross-business administrative operations remain on the server.

## Local setup

Run from the repository root, using Node 22.13 or later:

```powershell
npm ci
npm run typecheck:mobile
npm run admin
# In another terminal:
npm run start --workspace business-expo-app -- --port 8082
```

For an Android emulator, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:10000` in the selected app's `.env` and run the web gateway from `web`. A physical device needs the development machine's reachable LAN address instead. Cleartext HTTP is allowed only in development JavaScript; release builds require HTTPS. The default origin is the existing production domain, and `.env.example` documents the optional override.

`EXPO_PUBLIC_API_URL` is a public service address, not a credential. Never put `SESSION_SIGNING_KEY`, database credentials, encryption keys or AI provider keys in any `EXPO_PUBLIC_*` variable.

## Android builds

Link each application to a **different EAS project**, running these commands from its own directory:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

The preview profile produces an APK for direct installation. Use `--profile production` for an Android App Bundle, following the [Expo APK build documentation](https://docs.expo.dev/build-reference/apk/). Each project needs its own signing identity. No EAS project ID, signing key or fabricated account is included in the source. No EAS upload, signed APK build or store submission was performed here.

Deploy the matching web backend before installing production builds; the apps use the new native authentication endpoints. Keep the WhatsApp Node process and persistent device storage running. A phone displaying a linking QR code needs a second screen/device to scan it from WhatsApp Linked devices.

## Verification and release limits

- Both native apps pass TypeScript checks and Android Hermes bundle export. Exports are in `outputs/expo-admin` and `outputs/expo-business`; these are JavaScript/bytecode bundles, **not installable APKs**.
- `npm run check:public-bundles` checks the business web and Android artifacts for private branding, owner cookie names and admin endpoint references.
- Native authentication, revocation and tenant boundaries are exercised against isolated databases in the web regression suite.
- No Android emulator or physical-device execution was available. Camera/QR linking, real provider calls, real message delivery, offline behavior and store distribution still need device/release verification.
- The online npm audit reports 11 moderate advisories in the Expo build-tool chain through `glob`/`minimatch`. No high or critical advisories were reported in that mobile audit. The automatic proposed fix downgrades Expo; it was not applied. An offline audit is not evidence that these advisories are resolved.
- The owner credential record confirms the saved username and password hash. It has no email field; no email address or password was added or changed.
