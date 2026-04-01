<!-- Completed: 2026-03-31 | Commit: dc9101a -->
# TASK-049: Show subscription tier in extension popup

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Add tier display to the extension popup's signed-in state. After sign-in, show the user's subscription tier (Free or Pro) alongside their email, so users know what features they have access to. Fetched directly from Supabase using the existing session.

## Verification Criteria

1. `chrome-extension/src/utils/bridge.js` exports a new `fetchTier()` function that queries `subscriptions` and `profiles` for the current user and returns `'pro'`, `'free'`, or `null` on error.
2. Popup auth-info section shows a tier badge ("Pro" or "Free") below the user's email when signed in.
3. Tier is re-fetched on each popup open (not cached beyond the session).
4. If the Supabase query fails, the tier badge is hidden gracefully — no error shown to user.

## Verification Approach

1. Read `chrome-extension/src/utils/bridge.js` — confirm `fetchTier()` is exported and queries both `subscriptions` and `profiles` tables correctly.
2. Read `chrome-extension/src/popup/popup.html` — confirm `auth-tier` badge element is present inside `auth-info`.
3. Read `chrome-extension/src/popup/popup.js` — confirm `fetchTier()` is called in `renderAuthInfo()`, result sets badge text and class, and failure hides the badge.
4. Run `cd chrome-extension && npm run build` — confirm clean build.
5. **Developer step:** With a pro account signed in, confirm "Pro" badge appears. With a free account, confirm "Free" badge appears.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/utils/bridge.js` | Modify | Add `fetchTier()` — queries subscriptions + profiles, derives tier |
| `chrome-extension/src/popup/popup.html` | Modify | Add `<span id="auth-tier" class="tier-badge">` inside auth-info div |
| `chrome-extension/src/popup/popup.js` | Modify | Call `fetchTier()` in `renderAuthInfo()`, update badge; handle failure gracefully |
| `chrome-extension/src/popup/popup.css` | Modify | Style tier badge — Pro (accent blue pill), Free (muted grey pill) |

## Implementation Approach

### 1. `fetchTier()` in bridge.js

Query both tables in parallel:
- `subscriptions`: select `status` where `user_id = current user` and `status in ('active', 'trialing')`, limit 1
- `profiles`: select `beta_expires_at` where `id = current user`

Derive tier using the same logic as the web app's `SubscriptionContext`:
```
hasActiveSubscription = subData?.status === 'active' || subData?.status === 'trialing'
isBetaActive = profileData?.beta_expires_at && new Date(profileData.beta_expires_at) > new Date()
return (hasActiveSubscription || isBetaActive) ? 'pro' : 'free'
```

Wrap the entire function in try/catch — return `null` on any error so the popup hides the badge silently.

### 2. popup.html

Add inside the `auth-info` div, after `auth-user-email`:
```html
<span id="auth-tier" class="tier-badge" hidden></span>
```

### 3. popup.js

Update `renderAuthInfo(session)` to call `fetchTier()` after setting the email. On resolve:
- If tier is `'pro'`: set textContent to `"Pro"`, add class `pro`, remove class `free`, show badge.
- If tier is `'free'`: set textContent to `"Free"`, add class `free`, remove class `pro`, show badge.
- If null: hide badge (leave `hidden` attribute).

`fetchTier()` is async — the email renders immediately while the badge loads in, which is fine.

### 4. popup.css

```css
.tier-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.tier-badge.pro  { background: #3a6bbd; color: #fff; }
.tier-badge.free { background: #333; color: #888; }
```

## Dependencies

TASK-043 (Supabase data bridge — bridge.js exists) — complete.

---
*Approved by: <!-- developer name/initials and date once approved -->*
