# Private Alpha Invite Readiness

Use this checklist before inviting external creators. The goal is operational
confidence, not more product scope.

## Creator Flow

1. Sign in on the hosted app with the intended Google account.
2. Connect or sync YouTube.
3. Select focused videos with source-ready captions or known audio-backed assets.
4. Configure title, audience, depth, tone, and template.
5. Complete Stripe test checkout.
6. Confirm the project moves past `awaiting_payment` without SQL.
7. Review, edit, approve, publish, edit again, and republish.
8. Open the public hub and page detail unauthenticated.

## Operator Checks

Run the hosted environment check:

```powershell
$env:ALPHA_ENV_DOCTOR_STRICT="true"
$env:ALPHA_HOSTED_URL_CHECK="true"
pnpm env:doctor
Remove-Item Env:ALPHA_HOSTED_URL_CHECK
```

Inspect a specific run after checkout:

```powershell
$env:ALPHA_INSPECT_RUN_ID="<run-id>"
pnpm inspect:alpha-run
Remove-Item Env:ALPHA_INSPECT_RUN_ID
```

The inspector prints payment status, matching Stripe webhook events, stage
status, draft page count, live release state, and the next operator action.

If a paid run is stuck in `queued`, `running`, or `failed`, rescue it without
raw SQL:

```powershell
$env:ALPHA_RESCUE_CONFIRM="true"
$env:ALPHA_RESCUE_RUN_ID="<run-id>"
pnpm rescue:alpha-run
Remove-Item Env:ALPHA_RESCUE_CONFIRM
Remove-Item Env:ALPHA_RESCUE_RUN_ID
```

The rescue command refuses unpaid runs, writes audit rows, retries stale running
stage rows through the shared idempotent harness, and leaves publish/review to
the normal creator/admin flow.

Before using rescue, prefer proving or retrying the durable Trigger worker path:

```powershell
$env:ALPHA_TRIGGER_RUN_ID="<paid-queued-or-failed-run-id>"
pnpm smoke:trigger-dispatch
Remove-Item Env:ALPHA_TRIGGER_RUN_ID
```

This dispatches the existing paid run to the `run-pipeline` Trigger task and
waits for `awaiting_review`. It does not publish. If this fails because the
Trigger task is missing, deploy `@creatorcanon/worker` before inviting external
creators.

## Admin Rescue

Use `/admin/runs/<run-id>` before touching SQL:

- Check whether Stripe delivered and processed `checkout.session.completed`.
- Check whether the run has a `pi_...` payment intent.
- Re-dispatch a paid queued/failed run with `pnpm smoke:trigger-dispatch` if
  worker dispatch stalled.
- Use `pnpm rescue:alpha-run` only if Trigger is unavailable and a private-alpha
  paid run needs emergency completion.
- Rerun from a failed stage when stage output needs rebuilding.
- Publish current draft only when draft pages exist.

Admin actions write audit rows. Do not use rescue actions for unpaid runs.

## Secret Hygiene

Rotate `STRIPE_WEBHOOK_SECRET` before inviting external users if the current
secret appeared in logs or chat. After rotation, redeploy Vercel and verify one
signed webhook probe or fresh hosted checkout.

## Deferred

The YouTube `captions.download` lane is wired, but source-positive proof from
real YouTube captions still requires at least one channel video with captions
enabled in YouTube Studio.
