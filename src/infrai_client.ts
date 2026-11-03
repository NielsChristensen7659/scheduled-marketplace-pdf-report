import { z } from "zod";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional()
  }).passthrough().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl: string
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generatePdf(markdown: string, idempotencyKey: string): Promise<unknown> {
    return this.post("/v1/pdf/generate", { markdown, page_size: "A4", orientation: "portrait", store: true }, idempotencyKey);
  }

  async createSchedule(cronExpr: string, task: string, idempotencyKey: string): Promise<{ job_id: string }> {
    const data = await this.post("/v1/cron/create", { cron_expr: cronExpr, task }, idempotencyKey);
    return z.object({ job_id: z.string() }).parse(data);
  }

  private async post(path: string, body: unknown, idempotencyKey: string): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify(body)
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const raw: unknown = await response.json();
      const envelope = envelopeSchema.parse(raw);
      if (!envelope.ok) {
        const error = envelope.error;
        if (!error) throw new Error("Invalid response envelope");
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response.headers.get("retry-after"), attempt));
          continue;
        }
        throw new InfraiError(error.code, response.status, error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 500 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
