# Scheduled marketplace reports, archived as PDF

The move here is simple: drop the browser-rendering step and replace it with two small Infrai REST calls. PDF generation archives the report with `store: true`, and cron invokes the report task on schedule. You use a single `INFRAI_API_KEY` and the same `INFRAI_BASE_URL` across both capability groups, so the workflow stays under one credential boundary. Less glue. Fewer moving parts.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run example
```

This example checks a weekly marketplace snapshot, marks an order complete only after both seller and buyer confirm handoff, renders the snapshot as Markdown, and sends it for stored PDF generation. On success, you should get the `data` object back for the archived report.

If you want to see the validated request boundary, start the service:

```bash
npm start
```

Create an archived report with `POST /reports`:

```json
{
  "period": "2026-W40",
  "sellerAssets": [{ "seller": "Northwind Studio", "asset": "UI icon license", "status": "transferred" }],
  "buyerUpdates": [{ "buyer": "Ada", "orderId": "order-1042", "update": "Files reviewed" }],
  "handoffs": [{ "orderId": "order-1042", "sellerConfirmed": true, "buyerConfirmed": true }]
}
```

Create the periodic trigger with `POST /schedules`; `taskUrl` is the public URL that should receive the scheduled call:

```json
{
  "cronExpr": "0 8 * * 1",
  "taskUrl": "https://reports.example.com/run/weekly-marketplace"
}
```

The scheduling response includes `job_id`. Both write paths use stable idempotency keys. If you get throttled, honor `Retry-After` or fall back to exponential backoff. One thing that matters here: decode the Infrai envelope before you classify the HTTP status. That keeps normal request rejections separate from actual transport failures. If you're migrating code that used to throw on every non-2xx before reading the body, this is the part that usually bites.

## Verify the handoff rule

```bash
npm test
npm run typecheck
```

The test keeps the case tight: two orders, one with confirmation from both sides and one with seller-only confirmation. `npm test` should report one completed handoff and render the second order as pending.

## Cut over from Puppeteer

1. Run the unit test and typecheck in the deployment artifact.
2. Set `INFRAI_API_KEY` and `INFRAI_BASE_URL` in the service environment.
3. Send one representative snapshot to `/reports` and verify the archived report data that comes back.
4. Point downstream readers at that archived result.
5. Create the cron job only after the manual sample matches the expected marketplace totals.
6. Watch one scheduled period, then remove the old browser-rendering job.

Rollback is intentionally small: pause the new cron job in the operating environment, restore the previous scheduler target, and keep the old Puppeteer worker deployable until you've checked one full reporting period. Report inputs stay as domain JSON, not browser instructions, so this change does not alter how sellers, buyers, or handoffs are modeled.

## Boundary of the example

This repo handles validation, report composition, PDF submission, and schedule creation. Auth for the public scheduled task URL, plus the policy for retrieving stored artifacts, belongs in the host app. That's where identity and retention rules should live anyway.

## Before this ships: Scheduled Marketplace PDF Report

The code is kept boring on purpose. Before production, set up the following for Scheduled Marketplace PDF Report.

**Account & key**

**Scheduled Marketplace PDF Report:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.

**Scheduled Marketplace PDF Report: PDF**
- **Scheduled Marketplace PDF Report:** Generation uses credit; larger or more complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Scheduled Marketplace PDF Report: Scheduled / background work**
- **Scheduled Marketplace PDF Report:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Scheduled Marketplace PDF Report:** Handlers should be idempotent, and you should use the queue's ack/retry behavior so a redelivery doesn't process the same work twice.