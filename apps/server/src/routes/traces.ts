import { Hono } from "hono";
import { type SpanStatus, tracingService } from "../services/tracing";

export const tracesRouter = new Hono();

// Get list of traces
tracesRouter.get("/", async (c) => {
  const limit = Number(c.req.query("limit") || "50");
  const offset = Number(c.req.query("offset") || "0");
  const status = c.req.query("status") as SpanStatus | undefined;
  const service = c.req.query("service");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const result = await tracingService.getTraces({
    limit,
    offset,
    status,
    service,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return c.json(result);
});

// Get single trace with all spans
tracesRouter.get("/:traceId", async (c) => {
  const traceId = c.req.param("traceId");
  const trace = await tracingService.getTrace(traceId);

  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json(trace);
});

// Cleanup old traces
tracesRouter.post("/cleanup", async (c) => {
  const body = await c.req.json<{ olderThanDays?: number }>();
  const days = body.olderThanDays || 7;

  const deleted = await tracingService.cleanup(days);

  return c.json({ success: true, deleted });
});
