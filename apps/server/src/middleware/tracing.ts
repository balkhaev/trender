import type { MiddlewareHandler } from "hono";
import {
  runWithTraceContext,
  type TraceContext,
  tracingService,
} from "../services/tracing";

export const TRACE_HEADER = "X-Trace-ID";
export const SPAN_HEADER = "X-Span-ID";

// Пути которые не нужно трейсить (health checks, static)
const SKIP_PATHS = ["/", "/health", "/favicon.ico"];

export const tracingMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;

  // Skip tracing for certain paths
  if (SKIP_PATHS.includes(path)) {
    return next();
  }

  // Check for incoming trace ID (from other services)
  const incomingTraceId = c.req.header(TRACE_HEADER);
  const incomingSpanId = c.req.header(SPAN_HEADER);

  const method = c.req.method;
  const name = `${method} ${path}`;

  try {
    // Start or continue trace
    const { traceId, spanId } = await tracingService.startTrace({
      traceId: incomingTraceId,
      name,
      rootService: "server",
      rootPath: path,
      metadata: {
        method,
        path,
        query: Object.fromEntries(new URL(c.req.url).searchParams),
      },
    });

    // Create root span context for this request
    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: incomingSpanId,
    };

    // Set response headers for downstream propagation
    c.header(TRACE_HEADER, traceId);
    c.header(SPAN_HEADER, spanId);

    // Run request handler with trace context
    await runWithTraceContext(context, async () => {
      const span = await tracingService.startSpan({
        name,
        kind: "server",
        service: "server",
        attributes: {
          "http.method": method,
          "http.url": c.req.url,
          "http.route": path,
        },
      });

      try {
        await next();

        span.setAttribute("http.status_code", c.res.status);
        span.setStatus(c.res.status >= 400 ? "error" : "ok");
      } catch (error) {
        span.setStatus(
          "error",
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      } finally {
        await span.end();
        await tracingService.endTrace(
          traceId,
          c.res.status >= 400 ? "error" : "ok"
        );
      }
    });
  } catch (error) {
    // If tracing fails, still process the request
    console.error("[Tracing] Error:", error);
    await next();
  }
};
