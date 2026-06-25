# EAS build env vars

Cloud builds pull from git and **do not see the gitignored `.env`**. So every
`EXPO_PUBLIC_*` value the app needs at build time must exist as an **EAS
environment variable**. These are all `EXPO_PUBLIC_*` → embedded in the app
bundle → `plaintext` visibility (not secrets).

Build profiles map to environments (see `eas.json`):
`preview → preview`, `production → production`, `development → development`.
The commands below create each var in **both** `preview` and `production` so
your test APK and your store build both work. (If your EAS CLI rejects the
repeated `--environment` flag, run each command once per environment instead.)

## Already handled in code (no env var needed)
- `EXPO_PUBLIC_API_BASE_URL` → falls back to `https://api.ecofy.co.tz` in `app.config.ts`.
- `EXPO_PUBLIC_EAS_PROJECT_ID` → hardcoded fallback in `app.config.ts`.

  (You can still set them explicitly below if you prefer no fallbacks.)

## Run these (values pulled from your local .env)

```bash
# Mapbox (maps + geocoding) — public client token, safe to embed
eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN \
  --value "pk.<YOUR_MAPBOX_PUBLIC_TOKEN>" \   # copy EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN from your local .env
  --visibility plaintext --type string --non-interactive

eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_MAPBOX_STYLE_URL \
  --value "mapbox://styles/mapbox/satellite-streets-v12" \
  --visibility plaintext --type string --non-interactive

# Environment label
eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_ENVIRONMENT \
  --value "production" \
  --visibility plaintext --type string --non-interactive

# API base (optional — there is a fallback, but explicit is fine)
eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_API_BASE_URL \
  --value "https://api.ecofy.co.tz" \
  --visibility plaintext --type string --non-interactive
```

## TODO — set after you regenerate Google Sign-In under the NEW account
The old account's client IDs are intentionally omitted. Once you create new
OAuth client IDs (Android client needs your package `com.ecofy.mobile` + the
build's SHA-1; the Web client is the token audience), set:

```bash
eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "<NEW_WEB_CLIENT_ID>" \
  --visibility plaintext --type string --non-interactive

eas env:create --environment preview --environment production \
  --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value "<NEW_ANDROID_CLIENT_ID>" \
  --visibility plaintext --type string --non-interactive
```
Until these are set, Google Sign-In will be disabled in the build (email/password
login still works). Push and maps are unaffected.

## Verify what's set
```bash
eas env:list --environment production
```

## Build
```bash
# Installable APK for device testing (push + maps)
eas build --platform android --profile preview

# Store build (AAB) when ready to submit
eas build --platform android --profile production
```
