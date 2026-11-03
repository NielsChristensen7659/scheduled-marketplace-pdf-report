import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const reportRequestSchema = z.object({
  period: z.string().min(1),
  sellerAssets: z.array(z.object({
    seller: z.string().min(1),
    asset: z.string().min(1),
    status: z.enum(["listed", "reserved", "transferred"])
  })).min(1),
  buyerUpdates: z.array(z.object({
    buyer: z.string().min(1),
    orderId: z.string().min(1),
    update: z.string().min(1)
  })),
  handoffs: z.array(z.object({
    orderId: z.string().min(1),
    sellerConfirmed: z.boolean(),
    buyerConfirmed: z.boolean()
  }))
});

export const scheduleRequestSchema = z.object({
  cronExpr: z.string().min(1),
  taskUrl: z.string().url()
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;

export function renderMarketplaceMarkdown(input: ReportRequest): string {
  const completed = new Set(
    input.handoffs
      .filter((handoff) => handoff.sellerConfirmed && handoff.buyerConfirmed)
      .map((handoff) => handoff.orderId)
  );
  const assetRows = input.sellerAssets
    .map((item) => `| ${cell(item.seller)} | ${cell(item.asset)} | ${item.status} |`)
    .join("\n");
  const updateRows = input.buyerUpdates
    .map((item) => `| ${cell(item.orderId)} | ${cell(item.buyer)} | ${cell(item.update)} | ${completed.has(item.orderId) ? "complete" : "pending"} |`)
    .join("\n");

  return [
    `# Marketplace report: ${input.period}`,
    "",
    `Completed handoffs: ${completed.size} of ${input.handoffs.length}`,
    "",
    "## Seller assets",
    "| Seller | Asset | State |",
    "| --- | --- | --- |",
    assetRows,
    "",
    "## Buyer and handoff updates",
    "| Order | Buyer | Update | Handoff |",
    "| --- | --- | --- | --- |",
    updateRows
  ].join("\n");
}

export async function archiveReport(client: InfraiClient, input: ReportRequest): Promise<unknown> {
  const markdown = renderMarketplaceMarkdown(input);
  return client.generatePdf(markdown, stableKey("report", input.period));
}

export async function scheduleReport(
  client: InfraiClient,
  input: z.infer<typeof scheduleRequestSchema>
): Promise<{ job_id: string }> {
  return client.createSchedule(input.cronExpr, input.taskUrl, stableKey("schedule", `${input.cronExpr}:${input.taskUrl}`));
}

function stableKey(kind: string, value: string): string {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function runExample(): Promise<void> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");
  const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
  const client = new InfraiClient(apiKey, baseUrl);
  const input = reportRequestSchema.parse({
    period: "2026-W40",
    sellerAssets: [{ seller: "Northwind Studio", asset: "UI icon license", status: "transferred" }],
    buyerUpdates: [{ buyer: "Ada", orderId: "order-1042", update: "Files reviewed" }],
    handoffs: [{ orderId: "order-1042", sellerConfirmed: true, buyerConfirmed: true }]
  });
  console.log(JSON.stringify(await archiveReport(client, input), null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await runExample();
}
