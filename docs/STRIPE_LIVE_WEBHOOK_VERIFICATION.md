# Stripe LIVE Webhook Verification Runbook

This runbook helps achieve production launch confidence by verifying Stripe LIVE webhook delivery to `https://api.8fold.app/api/webhooks/stripe`.

## Summary of Findings

| Finding | Detail |
|--------|--------|
| **Stripe CLI mode** | `stripe trigger` only creates **TEST** events. It does NOT support `--live`. |
| **Workbench vs Classic** | Workbench Event Destinations and Classic Webhooks each have their own signing secret. `STRIPE_WEBHOOK_SECRET` must match the secret of the endpoint that receives events. |
| **LIVE verification** | For LIVE, use either: (1) Classic Webhook endpoint with its signing secret, or (2) a real LIVE PaymentIntent completion. |

---

## A) Confirm Stripe Account + Mode

### 1. CLI context

```bash
pnpm -C apps/api stripe:cli-context
```

Expected output includes:
- Stripe CLI version (e.g. `stripe version 1.35.0`)
- Account ID (e.g. `acct_1SwrTkEjxYg3jL8E`)
- Dashboard URLs for test/live

### 2. Verify account match

- Open https://dashboard.stripe.com
- Check the URL for `acct_...` — it must match the CLI account ID
- Toggle **Test/Live** in the Dashboard to see which mode you're viewing

### 3. CLI mode behavior

| Command | Default mode | `--live` support |
|---------|-------------|------------------|
| `stripe trigger payment_intent.succeeded` | TEST only | No |
| `stripe listen --forward-to ...` | TEST | Yes (`--live` for live events) |
| `stripe events resend evt_xxx --webhook-endpoint=we_xxx` | TEST | Yes (`--live`) |

---

## B) Deterministic Webhook Verification

### Path 1 (Preferred): Classic Webhook Endpoint in LIVE

1. **Create endpoint**
   - Dashboard → Developers → Webhooks (or https://dashboard.stripe.com/webhooks)
   - Ensure you're in **Live** mode (toggle top-right)
   - Click **Add endpoint**
   - Endpoint URL: `https://api.8fold.app/api/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `payout.paid`, `transfer.created` (or "Select events" and choose these)
   - Click **Add endpoint**

2. **Get signing secret**
   - After creation, click the endpoint → **Reveal** signing secret
   - Copy the `whsec_...` value

3. **Update Vercel**
   - Vercel → 8Fold API project → Settings → Environment Variables
   - Set `STRIPE_WEBHOOK_SECRET` to the Classic endpoint's `whsec_...`
   - Redeploy

4. **Workbench vs Classic**
   - Workbench Event Destinations use a different signing secret than Classic Webhooks
   - `STRIPE_WEBHOOK_SECRET` must match the secret of the endpoint that receives events
   - If you use Workbench, use that secret; if you use Classic, use Classic's secret

### Path 2 (Alternative): Real LIVE PaymentIntent

1. Create a minimal LIVE PaymentIntent:
   ```bash
   DOTENV_CONFIG_PATH=apps/api/.env.local tsx apps/api/scripts/createLivePaymentIntentForWebhookTest.ts
   ```
2. Complete the payment (Dashboard → Payments → Test payment, or frontend with client_secret)
3. Use test card 4242 4242 4242 4242
4. Stripe will send `payment_intent.succeeded` to your registered webhook endpoint

---

## C) Confirm Delivery

### 1. Stripe webhook delivery logs

- Dashboard → Developers → Webhooks → [your endpoint]
- **Recent deliveries** tab
- Look for successful (200) responses

### 2. Vercel logs

- Vercel → 8Fold API → Logs
- Search for `STRIPE_WEBHOOK:` (structured log prefix)
- Events: `STRIPE_WEBHOOK:received`, `STRIPE_WEBHOOK:signature_invalid`, `STRIPE_WEBHOOK:handler_error`

### 3. DB idempotency

- `StripeWebhookEvent` table stores event IDs for idempotency
- Run `pnpm -C apps/api verify:webhook:live` to list events and check DB for rows

---

## D) Webhook Verify Script

```bash
pnpm -C apps/api verify:webhook:live
```

This script:
- Prints env presence (no secret values)
- Lists last 5 `payment_intent.succeeded` events from Stripe API
- Checks DB for `StripeWebhookEvent` rows
- Outputs PASS/FAIL with reason

---

## E) Troubleshooting Matrix

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| **400** | Signature mismatch | Ensure `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret (Classic vs Workbench) |
| **500** | Handler error | Check Vercel logs for `STRIPE_WEBHOOK:handler_error`; inspect `ref` and `message` |
| **Nothing shows up** | Wrong account/mode or endpoint not registered | Ensure Dashboard is in Live mode; verify endpoint URL matches; check webhook is registered |
| **Events in TEST but not LIVE** | CLI/stripe trigger uses TEST only | Use Path 1 (Classic) or Path 2 (real PaymentIntent) for LIVE |

---

## F) Launch Gate Requirement

**Evidence required:** One LIVE delivery returning **200** and being idempotent.

Checklist:
1. [ ] Classic Webhook endpoint created in LIVE mode
2. [ ] `STRIPE_WEBHOOK_SECRET` in Vercel matches endpoint's signing secret
3. [ ] At least one LIVE `payment_intent.succeeded` delivered to endpoint
4. [ ] Stripe dashboard shows 200 response
5. [ ] Vercel logs show `STRIPE_WEBHOOK:received` with `livemode: true`
6. [ ] `StripeWebhookEvent` table (or equivalent) contains the event ID (idempotency)

---

## References

- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [Stripe CLI Triggers](https://docs.stripe.com/stripe-cli/triggers) (TEST only)
- [Stripe CLI Listen](https://docs.stripe.com/cli/listen) (supports `--live`)
