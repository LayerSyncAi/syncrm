# Sync Estate mobile app

The Android and iOS app for Sync Estate (SynCRM, Sync Stay, Sync Worth,
SyncMedia, the Hub and the landlord and tenant portals). Built with Expo and
expo-router. It talks to the same Convex backend as the website, using the
functions in `../convex`, so every rule and permission is enforced in one place.

## Run it

Needs Node 20, 22 or 24 (Expo does not support Node 26 yet).

```
cd mobile
npm install
cp .env.example .env.local   # set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_WEB_URL
npx expo start
```

Scan the QR code with Expo Go on a phone, or press `i` / `a` for a simulator.
A phone on the same Wi-Fi cannot reach `127.0.0.1`: point
`EXPO_PUBLIC_CONVEX_URL` at a cloud dev deployment, or at your computer's LAN
address when using a local Convex backend.

## Layout

- `app/` screens (expo-router). `hub.tsx` is home after sign-in. Each module
  (`crm`, `stay`, `worth`, `media`, `portal`, `admin`) has a stack, and the
  main modules have bottom tabs in `(tabs)/` with a "More" tab for the rest.
  Routes mirror the website: `/app/stay/leases/x` on the web is
  `/stay/leases/x` here (see `lib/routes.ts`).
- `components/ui.tsx` the shared UI kit; module components under
  `components/<module>/`.
- `lib/` the Convex client, session, formatting, uploads and PDFs
  (`lib/files.ts`: photos are compressed to 1600 px before upload; PDFs are
  built from HTML with expo-print and shared).
- Pure helpers from the website are imported with `@/` (the website's
  `src/`). Never import web components or DOM-only code into the app.

## Push notifications

Phones get the same alerts as the website's browser push (activity reminders,
the daily agenda and every notification-centre alert from the modules) through
Expo's push service; `convex/pushSender.ts` sends to both. The app offers push
once after the first sign-in, and "Phone notifications" on the account screen
switches it on or off. Push needs an EAS project id: run `eas init` once,
which writes it into `app.json`. Expo Go and simulators cannot receive push;
use a development or store build on a real phone.

Store builds also need the platform credentials, set up once per app:

- iOS: let EAS manage credentials when it asks during `eas build`; it creates
  the Apple push key.
- Android: create a Firebase project for `ai.layersync.syncestate`, then
  upload its FCM V1 service-account key with `eas credentials` (Android, Push
  Notifications) and its `google-services.json` with
  `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`.
  `app.config.js` picks the file up.

## Location search

Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (a key restricted to the iOS and Android
apps) for Google Places suggestions in property location fields, as on the
website. Without it the field is plain text.

## Checks

```
npx tsc --noEmit
npx expo export --platform ios     # and --platform android
```

## Store builds

`eas.json` holds the Convex and website URLs per build profile. Replace the
`REPLACE-*` values, then `eas build --platform all --profile production`.
