# App Store Compliance — Ecofy

Status of store-readiness work and what's left for you to do in the Play Console /
App Store Connect. **Strategy: ship Google Play first; iOS deferred** (Apple
Sign-In is required on iOS because we offer Google Sign-In — see §6).

---

## 1. What's done in code

| Item | Where | Notes |
|------|-------|-------|
| **Privacy Policy** (public URL) | `GET /legal/privacy` | Served by backend at `https://api.ecofy.co.tz/legal/privacy` |
| **Terms of Service** (public URL) | `GET /legal/terms` | `https://api.ecofy.co.tz/legal/terms` |
| In-app legal links | Settings → Legal | Open the hosted pages in an in-app browser |
| Registration consent | Register screen | "By continuing you agree to Terms & Privacy" with tappable links |
| **In-app account deletion** | Settings → Account → Delete account | 30-day grace, then permanent purge |
| Account-deletion backend | `POST /api/users/me/delete`, daily purge job, login auto-cancel | `account_deletion_service.py` + scheduler @ 03:00 EAT |
| **Location prominent disclosure** | shown before first location request | Required by Play; `lib/location/permission.ts` |
| No background location auto-prompt | boundary picker + map screen | Only prompt on explicit user action, with disclosure |
| Permissions hygiene | `app.config.ts` | Dropped legacy `READ/WRITE_EXTERNAL_STORAGE` (now `blockedPermissions`) |
| Permission usage strings | `app.config.ts` infoPlist + expo-location/notifications config | Location, camera, photos all have rationale strings |

> ⚠️ The backend changes (legal routes + account deletion) must be **deployed to
> production** (`api.ecofy.co.tz`) before the policy URLs resolve and deletion works.
> The app points at production, so this is required before submission.

---

## 2. Google Play — Data Safety form (fill this in the Console)

Declare the following. Nothing is sold; nothing is used for ads.

| Data type | Collected | Shared | Purpose | Processor |
|-----------|-----------|--------|---------|-----------|
| Name, email, phone | Yes | No | Account, app functionality | — / Google (if Google login) |
| Approx. + precise location | Yes | Yes* | App functionality (farm mapping, weather/soil) | Mapbox, Open-Meteo, iSDA |
| Photos | Yes | Yes* | App functionality (crop logs, AI diagnosis) | AI provider via OpenRouter |
| Financial info (sales, payroll incl. mobile-money/bank entered by user) | Yes | No | App functionality (farm records) | — |
| App activity / farm data | Yes | Yes* | App functionality, AI recommendations | AI provider via OpenRouter |
| Device identifiers (push token) | Yes | Yes | Notifications | Expo, Google/Apple push |

\* "Shared" = sent to a third-party **processor** to provide the feature, not sold or
used for their own purposes. Declare data is **encrypted in transit** and that users
can **request deletion** (point to the in-app flow).

Other Play declarations:
- **Account deletion URL / method**: in-app (Settings → Delete account). If Play asks
  for a web URL, you may also expose one; the in-app path satisfies the policy.
- **Sensitive permissions**: location is foreground-only with in-app disclosure — no
  background-location declaration needed.
- **Target API level**: build with the current EAS SDK (already API 34+).
- **Content rating** questionnaire: this is a productivity/utility app, no objectionable content.

---

## 3. Apple App Privacy (when you do iOS)

Mirror the table above as "Data Linked to You" (app functionality). No tracking
(ATT) is used — declare "Data Not Used to Track You". `usesNonExemptEncryption: false`
is already set.

---

## 4. You still need to do (accounts / console — I can't)

- [ ] **Deploy backend to production** so `/legal/*` and `/api/users/me/delete` are live.
- [ ] **FCM v1 credentials** to EAS (`eas credentials`) — required for Android push (see push-notifications notes).
- [ ] **Privacy Policy URL** into Play Console (Store listing → Privacy Policy):
      `https://api.ecofy.co.tz/legal/privacy`
- [ ] Complete the **Data Safety** form (§2) and **Content rating** questionnaire.
- [ ] Store listing assets: icon (have), **feature graphic**, **screenshots**, short/full description.
- [ ] **App access**: provide Play reviewers a test login (or note Google Sign-In) so they can review.
- [ ] Confirm the **legal entity name / contact email** in `legal.py` (`COMPANY`,
      `CONTACT_EMAIL`) and have the policy text reviewed by counsel.
- [ ] Sign the app & set up the **Play App Signing** key (EAS handles this on submit).

---

## 5. Recommended before launch

- Use a real support inbox for `CONTACT_EMAIL` in `legal.py` (currently
  `support@ecofy.co.tz` — make sure it exists or change it).
- Verify the in-app browser opens the policy on a physical device.
- Test the full delete flow against production: request → log out → log back in within
  grace (account restored) → request again → confirm purge after the window.

## 6. Deferred: iOS / Sign in with Apple

Apple Guideline 4.8 requires offering **Sign in with Apple** on iOS because the app
offers Google Sign-In. Before iOS submission, add `expo-apple-authentication`, the
Apple button (iOS only), and backend Apple identity-token verification — or remove
Google Sign-In on iOS. Not needed for Google Play.
