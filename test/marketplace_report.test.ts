import assert from "node:assert/strict";
import test from "node:test";
import { renderMarketplaceMarkdown, reportRequestSchema } from "../src/marketplace_report.js";

test("counts a handoff only after both parties confirm", () => {
  const input = reportRequestSchema.parse({
    period: "2026-W40",
    sellerAssets: [{ seller: "Studio A", asset: "Font license", status: "reserved" }],
    buyerUpdates: [
      { buyer: "Buyer One", orderId: "order-done", update: "Accepted" },
      { buyer: "Buyer Two", orderId: "order-open", update: "Reviewing" }
    ],
    handoffs: [
      { orderId: "order-done", sellerConfirmed: true, buyerConfirmed: true },
      { orderId: "order-open", sellerConfirmed: true, buyerConfirmed: false }
    ]
  });

  const report = renderMarketplaceMarkdown(input);

  assert.match(report, /Completed handoffs: 1 of 2/);
  assert.match(report, /order-done.*complete/);
  assert.match(report, /order-open.*pending/);
});
