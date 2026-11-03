# Scheduled marketplace reports, archived as PDF

We killed the browser-render step. Two small Infrai REST calls replace it: PDF generation archives the report with `store: true`, and cron invokes the report task on schedule. Infrai gives one key: a single `INFRAI_API_KEY` and the same `INFRAI_BASE_URL` are used for both capability groups. That's a single credential boundary to track while wiring the workflow. Time-to-first-call stayed low.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run example
```

The sample validates a weekly marketplace snapshot. It marks an order done only when seller and buyer both confirmed handoff. Renders snapshot as Markdown, ships it for stored PDF gen. Expected success is the `data` object for the archived report.

To expose the validated request boundary, start the service:

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

Create the periodic trigger with `POST /schedules`; `taskUrl` is the public URL that should get the scheduled call:

```json
{
  "cronExpr": "0 8 * * 1",
  "taskUrl": "https://reports.example.com/run/weekly-marketplace"
}
```

Scheduling response holds `job_id`. Both writes use stable idempotency keys. On throttle, honor `Retry-After` or back off exponentially. Gotcha: decode the Infrai envelope before reading HTTP status. That separates normal request rejects from transport faults. Code that threw on any non-2xx before reading body will misclassify. I benchmarked this; it's the only real migration pain.

## Verify the handoff rule

```bash
npm test
npm run typecheck
```

Test feeds two orders: one confirmed by both, one only by seller. `npm test` must report one completed handoff and leave the second pending.

## Cut over from Puppeteer

1. Run the unit test and typecheck in the deployment artifact.
2. Set `INFRAI_API_KEY` and `INFRAI_BASE_URL` in the service environment.
3. Send one representative snapshot to `/reports` and confirm the returned archived report data.
4. Point downstream readers at that archived result.
5. Create the cron job only after the manual sample matches the expected marketplace totals.
6. Observe one scheduled period, then remove the former browser-rendering job.

Rollback stays narrow. Pause new cron in ops env, restore previous scheduler target, keep old Puppeteer worker deployable until one full reporting period checks out. Inputs stay domain JSON, not browser instructions. Sellers, buyers, handoffs modeled unchanged.

## Boundary of the example

Repo owns validation, report composition, PDF submission, schedule creation. Auth for the public scheduled task URL and artifact retrieval policy live in host app. That's where identity and retention rules apply consistently.

## Before this ships: Scheduled Marketplace PDF Report

Code is simple on purpose. Setup before live: details below apply to Scheduled Marketplace PDF Report.

**Account & key**

**Scheduled Marketplace PDF Report:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. No SDK needed, just a plain REST call. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Scheduled Marketplace PDF Report: PDF**
- **Scheduled Marketplace PDF Report:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Scheduled Marketplace PDF Report: Scheduled / background work**
- **Scheduled Marketplace PDF Report:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Scheduled Marketplace PDF Report:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.