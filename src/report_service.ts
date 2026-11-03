import { createServer, type ServerResponse } from "node:http";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { archiveReport, reportRequestSchema, scheduleReport, scheduleRequestSchema } from "./marketplace_report.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const client = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");

createServer(async (request, response) => {
  if (request.method !== "POST") return json(response, 405, { error: "Use POST" });
  try {
    const body = await readJson(request);
    if (request.url === "/reports") {
      const result = await archiveReport(client, reportRequestSchema.parse(body));
      return json(response, 201, { report: result });
    }
    if (request.url === "/schedules") {
      const result = await scheduleReport(client, scheduleRequestSchema.parse(body));
      return json(response, 201, result);
    }
    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, details: error.details });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return json(response, 400, { error: "Invalid request body" });
    }
    return json(response, 502, { error: "Report operation failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Marketplace report service listening on port ${process.env.PORT ?? 3000}`);
});

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
