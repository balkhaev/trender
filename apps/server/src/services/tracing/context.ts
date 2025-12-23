import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceContext } from "./types";

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

export function getCurrentSpanId(): string | undefined {
  return traceStorage.getStore()?.spanId;
}

export function runWithTraceContext<T>(
  context: TraceContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return traceStorage.run(context, fn);
}
