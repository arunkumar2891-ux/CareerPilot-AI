# Authentication

## Purpose

User authentication and session management. Supports email/password, Google OAuth, and magic link sign-in via Supabase Auth.

## Entry Points

- `/auth` route → `src/pages/AuthPage.tsx`
- App initialization → `src/App.tsx` (session restore + auth state listener)

## Flow

```
AuthPage (sign-in/sign-up form)
  → useAuthStore (src/store/index.ts)
    → supabase.auth.signInWithPassword / signUp / signInWithOAuth / signInWithOtp
      → Supabase Auth
        → on success: services.user.profile() → sets user in store
```

Session restore on app load:
```
App.tsx useEffect
  → supabase.auth.getSession()
    → useAuthStore.refresh() → services.user.profile()
    → useNotificationStore.load()
```

Protected routes via `<ProtectedRoute>` wrapper in `App.tsx`.

## Important Files

- `src/pages/AuthPage.tsx` — Login/signup UI
- `src/store/index.ts` — `useAuthStore` (signIn, signUp, signOut, refresh, OAuth, magic link)
- `src/lib/supabase.ts` — Supabase client initialization
- `src/lib/auth.ts` — `requireUserId()` helper
- `src/services/index.ts` → `UserService` class
- `src/App.tsx` — `ProtectedRoute`, `OAuthReturnRedirect`, auth state listener

## Data Flow

- Auth tokens managed by `supabase-js` (persisted in localStorage).
- User profile fetched from `profiles` table after successful auth.
- `OAuthReturnRedirect` handles OAuth callback redirect to `/integrations`.

## External Dependencies

- Supabase Auth (email, OAuth, OTP providers)

## Common Failure Points

- OAuth redirect may fail on static hosts without SPA rewrite rules (mitigated by `OAuthReturnRedirect` and `404.html` copy in build).
- Session refresh may silently fail, leaving user in a stale auth state.

## Important Rules

- Never expose Supabase service role key in frontend code.
- Auth state changes trigger `onAuthStateChange` listener — do not duplicate this.
