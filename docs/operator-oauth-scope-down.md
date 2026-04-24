# Operator — drop `youtube.force-ssl` from Google Cloud OAuth consent screen

**Status:** code shipped in commit `bfd059b` dropped the scope from the sign-in
request (`packages/auth/src/config.ts` now only requests
`openid / email / profile / youtube.readonly`). The Google Cloud OAuth consent
screen still advertises `youtube.force-ssl` as an approved scope. Remove it
there so new consents don't see the broader prompt.

This is a security-sensitive change at the OAuth app level and must be done
manually by the operator in Google Cloud Console. It cannot be automated
safely from the agent.

## Steps (≤5 min)

1. Open https://console.cloud.google.com/apis/credentials/consent
2. Confirm you're in the correct project (top bar) — the one tied to
   `AUTH_GOOGLE_ID=524579920552-...` per `.env`.
3. Click **EDIT APP** on the OAuth consent screen.
4. Step through to **Scopes**. Find `.../auth/youtube.force-ssl` in the
   "Your non-sensitive scopes" or "Your sensitive scopes" list.
5. Click **REMOVE** next to it.
6. **SAVE AND CONTINUE** through the remaining steps; no other edits needed.
7. On the final summary, confirm `youtube.force-ssl` no longer appears under
   approved scopes. `youtube.readonly` should remain.

## Effect

- **New consents**: the consent dialog will request only
  `email / profile / youtube.readonly`. Less friction, less scary.
- **Existing refresh tokens**: retain their broader scope until the user
  re-authenticates (signs out and signs in again). This is fine —
  `packages/pipeline/src/stages/ensure-transcripts.ts` no longer calls the
  owner-captions path that required `force-ssl`, so the broader scope is
  just latent.

## Verify afterwards

```bash
# Sign out on creatorcanon-saas.vercel.app, then sign in again.
# The Google consent screen should show:
#   - See your primary Google Account email address
#   - See your personal info, including any personal info you've made publicly available
#   - See, edit, share, and permanently delete all the calendars you can access using Google Calendar  ← absent
#   - View your YouTube account                                                                         ← present
```

Only "View your YouTube account" should reference YouTube. If
`force-ssl`-style phrasing ("Manage your YouTube account" or similar write/delete)
still appears, the scope wasn't removed — repeat from step 3.

## Rollback

If the `youtube.readonly` scope alone turns out insufficient for some future
feature (e.g. you re-enable the owner-captions lane in
`ensure-transcripts.ts`), re-add `.../auth/youtube.force-ssl` via the same
screen. Keep the corresponding `packages/auth/src/config.ts` scope array in
sync.
