import { SPAN_HEADER, TRACE_HEADER } from "../../middleware/tracing";
import { fetchWithTimeout } from "../../utils/fetch-with-timeout";
import { getTraceContext, tracingService } from "./index";

type TracedFetchOptions = RequestInit & {
  timeout?: number;
  spanName?: string;
  service?: string;
};

/**
 * Fetch с автоматической пропагацией trace context и созданием span
 */
export async function tracedFetch(
  url: string,
  options: TracedFetchOptions = {}
): Promise<Response> {
  const context = getTraceContext();
  const { timeout = 30_000, spanName, service, ...fetchOptions } = options;

  // Добавляем trace headers
  const headers = new Headers(fetchOptions.headers);
  if (context) {
    headers.set(TRACE_HEADER, context.traceId);
    headers.set(SPAN_HEADER, context.spanId);
  }

  const finalOptions: RequestInit = {
    ...fetchOptions,
    headers,
  };

  // Если нет context, просто делаем fetch
  if (!context) {
    return fetchWithTimeout(url, finalOptions, timeout);
  }

  // Оборачиваем в span
  return tracingService.withSpan(
    {
      name:
        spanName ?? `HTTP ${options.method ?? "GET"} ${new URL(url).pathname}`,
      kind: "client",
      service: service ?? "server",
      attributes: {
        "http.method": options.method ?? "GET",
        "http.url": url,
        "http.timeout_ms": timeout,
      },
    },
    async (span) => {
      try {
        const response = await fetchWithTimeout(url, finalOptions, timeout);
        span.setAttribute("http.status_code", response.status);
        span.setStatus(response.ok ? "ok" : "error");

        if (!response.ok) {
          span.addEvent("http_error", {
            status: response.status,
            statusText: response.statusText,
          });
        }

        return response;
      } catch (error) {
        span.setStatus(
          "error",
          error instanceof Error ? error.message : String(error)
        );
        span.addEvent("fetch_error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  );
}

/**
 * Хелпер для вызовов к scrapper сервису
 */
export function createScrapperFetch(baseUrl: string) {
  return (
    path: string,
    options: Omit<TracedFetchOptions, "service"> = {}
  ): Promise<Response> =>
    tracedFetch(`${baseUrl}${path}`, {
      ...options,
      service: "scrapper",
      spanName: `scrapper${path}`,
    });
}

/**
 * Хелпер для вызовов к video-frames сервису
 */
export function createVideoFramesFetch(baseUrl: string) {
  return (
    path: string,
    options: Omit<TracedFetchOptions, "service"> = {}
  ): Promise<Response> =>
    tracedFetch(`${baseUrl}${path}`, {
      ...options,
      service: "video-frames",
      spanName: `video-frames${path}`,
    });
}
