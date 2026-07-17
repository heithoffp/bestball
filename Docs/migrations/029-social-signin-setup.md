# ADR-029 — Google + Apple Sign-In: External Setup Checklist

Code for native Google/Apple sign-in (mobile) and Apple sign-in (web) is implemented
under TASK-345. The buttons stay **hidden/disabled until the external configuration
below is complete** — the app never starts an unconfigured flow. These steps are done
in third-party dashboards, not in the repo.

## 1. Apple Developer portal (Sign in with Apple)

1. Under **Certificates, Identifiers & Profiles → Identifiers**, open the App ID
   `com.bestballexposures.app` and enable the **Sign in with Apple** capability.
2. Create a **Services ID** (e.g. `com.bestballexposures.web`) for the *web* OAuth flow;
   configure its **Return URL** to the Supabase Apple callback
   (`https://cwjorshxkbbxjvhqxdlh.supabase.co/auth/v1/callback`).
3. Create a **Sign in with Apple key** (.p8) and note the **Key ID** and **Team ID**
   (`WNGNQ89YJ2`). Supabase uses these to generate the client secret.

## 2. Google Cloud console (OAuth clients)

1. **OAuth consent screen** configured (external, published).
2. Create an **iOS OAuth client** with bundle ID `com.bestballexposures.app`.
   - Copy its **iOS client ID** → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
   - Its **reversed** client ID (`com.googleusercontent.apps.<id>`) replaces the
     placeholder `iosUrlScheme` in `mobile-app/app.json`
     (`@react-native-google-signin/google-signin` plugin config).
3. Create a **Web application OAuth client** (used as the token audience / "server"
   client). Copy its **web client ID** → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and its
   client secret for the Supabase Google provider.

## 3. Supabase dashboard (Authentication → Providers)

1. **Apple:** enable; add the Services ID, Team ID, Key ID, and the .p8 key contents.
2. **Google:** enable; add the **web** client ID + secret. Add the **iOS** client ID to
   the provider's *Authorized Client IDs* list so native `signInWithIdToken` tokens are
   accepted.
3. Confirm **link-by-email** behavior so a provider sign-in with an email that already
   exists resolves to the same user (verify with the same-email test in TASK-345).
4. **Redirect allowlist:** the web return URL(s) plus the Chrome extension's
   `https://<extension-id>.chromiumapp.org/` redirect (used by
   `chrome.identity.launchWebAuthFlow` for both Google and Apple) must be in the
   Supabase **Redirect URLs** allowlist. The Google entry already exists for the
   extension's Google button; add the **Apple** provider's return URL and confirm the
   same `chromiumapp.org` redirect is accepted for Apple.

## 4. Inject the client IDs

- **Local dev / EAS:** set the two `EXPO_PUBLIC_GOOGLE_*` values. Placeholders (empty
  strings) live in `mobile-app/eas.json` `preview`/`production` env blocks — fill them
  with the real IDs (or configure as EAS secrets) before a distributable build.
- **Web:** no build-time client ID is needed — the web OAuth redirect is configured
  entirely in the Supabase dashboard (Apple provider settings above).

## 5. Build & verify (see TASK-345 verification)

- Native modules require an **EAS/dev build** — Google/Apple sign-in do **not** run in
  Expo Go.
- After the build, confirm `expo-apple-authentication` and
  `@react-native-google-signin/google-signin` appear in the `.ipa` `Frameworks/`
  (guards the known peer-dep autolink launch-crash).

## Related
- ADR-029 (decision), TASK-345 (implementation)
