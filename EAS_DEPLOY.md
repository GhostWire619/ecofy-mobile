# Shipping Ecofy to Google Play — DevOps

Pipeline: **EAS Build → EAS Submit → Play Console tracks**, automated from CI. Your
Expo/EAS setup already covers most prerequisites; this is the path from code to
a Play release.

## Already in place
- EAS project (`owner: ghostwire619`, project id set), `eas.json` with a
  `production` profile that outputs an **AAB** (`buildType: app-bundle`).
- `appVersionSource: remote` + `autoIncrement` → EAS manages `versionCode` so every
  build bumps automatically (no manual edits).
- FCM credentials uploaded; `google-services.json` wired; push works.
- App-store compliance: privacy policy + terms live at
  `https://api.ecofy.co.tz/legal/{privacy,terms}`, in-app account deletion, consent,
  location disclosure (see `STORE_COMPLIANCE.md`).
- Build-time env vars set as EAS environment variables (see `EAS_BUILD.md`).

---

## One-time setup

### 1. Google Play Developer account
- Register at play.google.com/console (**$25 one-time**).
- **Create app** → package `com.ecofy.mobile`, default language, app/game = App, free.

### 2. App signing (let EAS + Play manage keys)
- On your first `eas build -p android`, EAS generates and stores an **upload keystore**
  for you (don't hand-manage it).
- In Play Console the app is enrolled in **Play App Signing**: Google holds the real
  app signing key; you upload AABs signed with the EAS upload key. Nothing to do
  manually — EAS handles signing on build.

### 3. Service account so CI can upload (EAS Submit → Play API)
1. Play Console → **Setup → API access** → link/create a **Google Cloud project**.
2. In that GCP project → **IAM & Admin → Service Accounts** → create one
   (e.g. `play-publisher`) → **Keys → Add key → JSON** → download it.
   **This is a secret — never commit it.**
3. Back in Play Console → **Users & permissions → Invite** the service account email →
   grant app access with **Release** permission (can manage production releases) for
   the Ecofy app.
4. Save the JSON outside git (or upload as an EAS secret). Reference it in `eas.json`:
   ```jsonc
   "submit": {
     "production": {
       "android": {
         "serviceAccountKeyPath": "./google-play-service-account.json",
         "track": "internal",            // first uploads go to internal testing
         "releaseStatus": "draft"        // you click "publish" in the console
       }
     }
   }
   ```
   Add `google-play-service-account.json` to `.gitignore`.

### 4. First store listing (manual, once)
Fill in Play Console: store listing (title, descriptions, **screenshots**, feature
graphic, icon), **content rating** questionnaire, **Data safety** form (mapping in
`STORE_COMPLIANCE.md`), target audience, and the **Privacy Policy URL**
(`https://api.ecofy.co.tz/legal/privacy`). The first AAB must be uploaded before the
listing can go live; use the **Internal testing** track to start.

---

## The release flow (manual)
```bash
# 1. Build the Play AAB (EAS cloud, signed with the upload key)
eas build --platform android --profile production

# 2. Upload it to the Play internal track
eas submit --platform android --profile production --latest

# …or do both in one step:
eas build --platform android --profile production --auto-submit
```
Then in Play Console: review the internal release → promote **internal → closed
(beta) → production** when ready. `versionCode` auto-increments each build.

---

## Automate it (CI/CD with GitHub Actions)
Release on pushing a version tag (`v1.2.3`). Create `.github/workflows/release.yml`:

```yaml
name: Release to Play
on:
  push:
    tags: ['v*']
jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      # Builds the AAB on EAS and submits to Play in one shot
      - run: eas build --platform android --profile production --non-interactive --auto-submit
```

### CI secrets / config
- **`EXPO_TOKEN`** — create at expo.dev → Account → Access Tokens; add as a GitHub
  repo secret. This is all the workflow needs to talk to EAS.
- **Play service account** — store the JSON as an **EAS secret file** so cloud builds
  can read it without committing it:
  ```bash
  eas secret:create --scope project --name GOOGLE_PLAY_SERVICE_ACCOUNT \
    --type file --value ./google-play-service-account.json
  ```
  and point `serviceAccountKeyPath` at it (or keep the path and upload via EAS).
- **Build-time env vars** (Mapbox, Google client IDs, API URL) are already EAS
  environment variables for the `production` environment (see `EAS_BUILD.md`), so the
  cloud build picks them up — `.env` is never needed in CI.

### Versioning
- `version` (the user-facing `1.0.0`) lives in `app.config.ts`; bump it for each
  release and tag to match (`git tag v1.0.1 && git push --tags`).
- `versionCode` is auto-incremented by EAS (`appVersionSource: remote`).

---

## Recommended rollout
1. `eas build … --auto-submit` → lands in **Internal testing** (just your team).
2. Smoke-test the AAB build on a device (push, maps, login, account deletion).
3. Promote to **Closed testing** (a few real farmers) → gather feedback.
4. Promote to **Production** with a **staged rollout** (e.g. 10% → 50% → 100%).

## Still your TODO before first submit
- Register the Play developer account + create the app.
- Create the Play service account + grant release access.
- Complete store listing, content rating, and Data safety form.
- Confirm Sign in with Apple is **not** needed (Android only — it isn't).
