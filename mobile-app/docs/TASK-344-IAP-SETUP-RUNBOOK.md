# TASK-344 — Apple IAP (StoreKit 2) Setup & Verification Runbook

> Follow-along checklist for shipping mobile Pro via Apple In-App Purchase (ADR-028).
> All **code is already written**; everything below is the manual deploy + App Store
> Connect + on-device work that only the developer can do.
>
> **Reference values (from the codebase — do not change without updating both sides):**
> - Bundle ID: `com.bestballexposures.app`
> - Monthly product ID: `com.bestballexposures.app.pro.monthly` ($20/mo)
> - Annual product ID: `com.bestballexposures.app.pro.yearly` ($67/yr, "Save 72%")
> - Supabase project: `cwjorshxkbbxjvhqxdlh`
> - ASSN v2 webhook URL: `https://cwjorshxkbbxjvhqxdlh.supabase.co/functions/v1/apple-notifications`
> - Edge-function secret needed: `APPLE_ROOT_CA_G3`

---

## What blocks what

The **Paid Apps agreement** must be **Active** before you can *create IAP products* or
*run a sandbox purchase*. Almost everything else is independent and can be done in parallel
while the agreement processes.

| Track | Needs Paid Apps agreement Active? |
|---|---|
| Create the two subscription products (Phase 1.4) | ✅ Yes — blocked |
| Run on-device sandbox purchase tests (Phase 3.4) | ✅ Yes — blocked |
| Small Business Program, availability, sandbox tester | ❌ No — do now |
| All backend deploy (Phase 2) | ❌ No — do now |
| EAS build, lint, code commit | ❌ No — do now |

---

## Phase 0 — Account prerequisites (Agreements, Tax & Banking)

App Store Connect → **Business → Agreements, Tax, and Banking**.

- [x] **Paid Apps agreement** signed (requires the **Account Holder** role — only that role can sign).
- [x] **W-9 tax form** completed. It's filled in *inside* App Store Connect (no PDF to download).
  - **Federal tax classification:** Individual/sole proprietor if selling as yourself; else your entity type.
  - **TIN:** your **SSN** (individual/sole proprietor) or **EIN** (registered business). You already have this — nothing to request unless you formed an entity without an EIN.
  - **Exemptions:** leave **both** exemption boxes **blank** (an ordinary individual/sole proprietor is *not* an exempt payee and *not* FATCA-exempt).
  - Not tax advice — if you've formed an LLC/corp, confirm entity vs. individual with an accountant.
- [x] **Banking** info added.
- [ ] Agreement status flips to **Active**. (Until then, product creation + sandbox purchase are blocked; everything else below can proceed.)
- [ ] **DSA / trader status** submitted (may show "in review"; it gates EU distribution + IAP creation later, not agreement signing).

---

## Phase 1 — App Store Connect setup

### 1.1 — Small Business Program (do now, not blocked)
- [x] Enroll: Apple Developer → **App Store Small Business Program** (15% commission instead of 30%).

### 1.2 — International availability (do now, not blocked)
- [ ] App → **Pricing and Availability** → include **Canada / international** (remove the ADR-027 US-only restriction).

### 1.3 — Sandbox tester (do now, not blocked)
- [ ] Users and Access → **Sandbox → Testers** → add a tester with an email **not** already tied to an Apple ID. You'll sign into this on the phone during Phase 3.

### 1.4 — Create the subscription group + two products (BLOCKED until agreement Active)

App Store Connect → app → **Monetization → Subscriptions**.

**A. Subscription group**
- [ ] Create group → Reference Name: `BB Exposures Pro` (internal only)
- [ ] Add localization (English U.S.) → Subscription Group Display Name: `BB Exposures Pro`

**B. Monthly product**
- [ ] Create subscription:
  - Reference Name: `Pro Monthly`
  - Product ID: `com.bestballexposures.app.pro.monthly`  ⚠️ **immutable, must be exact**
- [ ] Duration: `1 Month`
- [ ] Price: **$20.00** if that point exists, else **$19.99** (see price-mismatch note below)
- [ ] Localization (English U.S.):
  - Display Name (≤30 chars): `BB Exposures Pro (Monthly)`
  - Description (≤45 chars): `All Pro tabs: ADP, Draft Assistant, Rankings`
- [ ] Review Information:
  - Screenshot: paywall (PlanPicker) screenshot — see Phase 3 note
  - Review Notes: `Auto-renewable Pro subscription unlocking ADP Tracker, Draft Assistant, custom Rankings, Combos, and Roster Construction. To test: sign in, open Account, tap Upgrade to Pro, choose Monthly.`

**C. Annual product**
- [ ] Create subscription:
  - Reference Name: `Pro Annual`
  - Product ID: `com.bestballexposures.app.pro.yearly`  ⚠️ **immutable, must be exact**
- [ ] Duration: `1 Year`
- [ ] Price: **$67.00** if available, else **$66.99**
- [ ] Localization (English U.S.):
  - Display Name (≤30 chars): `BB Exposures Pro (Annual)`
  - Description (≤45 chars): `Save 72% vs monthly. Every Pro feature.`
- [ ] Review Information:
  - Screenshot: same paywall screenshot
  - Review Notes: `Annual auto-renewable Pro subscription (same entitlement as monthly, billed yearly, ~72% savings). To test: Account -> Upgrade to Pro -> Annual.`

> **Status note:** products read **"Missing Metadata"** until every field + screenshot is filled,
> then move to **"Ready to Submit."** Sandbox purchasing works from "Ready to Submit" — you do
> **not** need App Review approval to test with a sandbox tester.

> **Price-mismatch flag:** `PlanPicker.jsx` currently hardcodes `$20`/`$67` labels. If Apple only
> offers $19.99/$66.99 price points, the store price will differ by a cent from the label. Fix
> options: set Apple prices to exactly $20.00/$67.00, **or** switch PlanPicker to show StoreKit's
> `localizedPrice` (a small code follow-up — App-Review-preferred). Decide before launch.

---

## Phase 2 — Backend deploy (Windows, not blocked by the agreement)

### 2.1 — Migration 017
- [ ] Supabase dashboard → SQL Editor → paste `supabase/migrations/017_add_apple_provider_to_subscriptions.sql` → Run.
- [ ] Verify:
```sql
select column_name from information_schema.columns
where table_name = 'subscriptions'
  and column_name in ('provider','apple_original_transaction_id');
```
Expect **two** rows.

### 2.2 — Apple Root CA - G3 secret
- [ ] Download "Apple Root CA - G3 Root" from https://www.apple.com/certificateauthority/
- [ ] Convert + set the secret:
```bash
openssl x509 -inform der -in AppleRootCA-G3.cer -out AppleRootCA-G3.pem
supabase secrets set APPLE_ROOT_CA_G3="$(cat AppleRootCA-G3.pem)"
```
(`appleJws.ts` throws if this is empty, so it must be set before either function verifies anything.)

### 2.3 — Deploy the three edge functions
```bash
supabase functions deploy apple-notifications --no-verify-jwt
supabase functions deploy sync-apple-purchase
supabase functions deploy delete-account
```
- [ ] `apple-notifications` deployed. `verify_jwt = false` is now pinned in `supabase/config.toml`, so the deploy sets it durably; the `--no-verify-jwt` flag is redundant belt-and-suspenders (Apple can't send a Supabase JWT — the function verifies Apple's JWS signature itself).
- [ ] `sync-apple-purchase` deployed (keeps JWT auth).
- [ ] `delete-account` re-deployed (Apple-awareness).

### 2.4 — Wire the notification URL
- [ ] App Store Connect → App → **App Information → App Store Server Notifications** → set **both** Production and Sandbox **Version 2** URLs to:
  `https://cwjorshxkbbxjvhqxdlh.supabase.co/functions/v1/apple-notifications`

### 2.5 — Smoke-test the webhook
- [ ] Click **Request a Test Notification** in that screen.
- [ ] Check logs: `supabase functions logs apple-notifications` → expect **200**.
  (A test notification has no `appAccountToken`, so "skip — no user" + 200 is the **correct** result, not a failure.)

---

## Phase 3 — Build & on-device verification (needs the iPhone)

### 3.1 — Install + lint (not blocked)
```bash
cd mobile-app
npm install
npm run lint
```
- [ ] `react-native-iap` installed, lint clean.

### 3.2 — EAS dev build (not blocked)
```bash
npm run eas:dev
```
- [ ] Build completes.
- [ ] Confirm StoreKit is linked: download the `.ipa`, unzip, check `react-native-iap` / nitro modules appear under `Payload/*.app/Frameworks/` (avoids the dyld launch crash — see `project_mobile_peer_dep_autolink`).

### 3.3 — Install on device
- [ ] Install the dev build.
- [ ] Sign into the app with a real Supabase account.
- [ ] Sign into the **sandbox tester** Apple ID (Settings → Developer → Sandbox Apple Account, or when the purchase sheet prompts).
- [ ] Capture the **paywall screenshot** here and upload it to both products in step 1.4.

### 3.4 — Verification criteria (BLOCKED until agreement Active + products live)
- [ ] **Criterion 1:** Free user taps **Upgrade to Pro**, completes the native Apple sheet → tier flips to Pro **in-app**, no browser/Stripe sheet appears anywhere.
- [ ] **Criterion 2:** Same account on **BestBallExposures.com** → Pro unlocked (a `provider='apple'` row reached the shared table).
- [ ] **Criterion 3a:** Delete + reinstall, sign in, **Restore Purchases** → Pro returns.
- [ ] **Criterion 3b:** **Manage subscription** → Apple purchaser lands on Apple's screen; a Stripe-origin account still opens the Stripe portal.
- [ ] **Criterion 4:** Sandbox accelerated renewal advances `current_period_end`; letting it lapse (`EXPIRED`) drops the app to Free.
- [ ] **Criterion 5:** **Delete account** on an Apple-subscribed account completes (**no 502**), removes the local row, shows the "cancel in iOS Settings" note, and attempts **no** Stripe cancel.

**DB / log checks during testing:**
```sql
select user_id, provider, status, apple_original_transaction_id, current_period_end
from subscriptions where provider = 'apple' order by current_period_end desc;
```
```bash
supabase functions logs sync-apple-purchase   # immediate-unlock path
supabase functions logs apple-notifications    # renewal / expiry path
```

---

## Wrap-up
- [ ] Commit the TASK-344 code (rollback point) — ideally before Phase 3 (it involves reinstalls + account deletion).
- [ ] All 5 criteria pass → present **Reflection: TASK-344**, then mark the task **Done** via hus-backlog.

---
*Companion to `docs/plans/TASK-344.md` (approved 2026-07-17) and ADR-028.*
