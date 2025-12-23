import type { Job as BullJob } from "bullmq";
import {
  getTraceContext,
  runWithTraceContext,
  type TraceContext,
  tracingService,
} from "./index";

export type TracedJobData = {
  traceId?: string;
  parentSpanId?: string;
};

/**
 * Получает trace context из job data
 */
export function getJobTraceContext(
  job: BullJob<TracedJobData>
): TraceContext | undefined {
  if (!job.data.traceId) return;

  return {
    traceId: job.data.traceId,
    spanId: job.data.parentSpanId ?? tracingService.generateSpanId(),
    parentSpanId: job.data.parentSpanId,
  };
}

/**
 * Добавляет trace context в job data при создании job
 */
export function addTraceToJobData<T extends object>(
  data: T
): T & TracedJobData {
  const context = getTraceContext();
  if (!context) return data as T & TracedJobData;

  return {
    ...data,
    traceId: context.traceId,
    parentSpanId: context.spanId,
  };
}

/**
 * Выполняет job handler в trace context
 * Автоматически создает span для job
 */
export async function runTracedJob<TData extends TracedJobData, TResult>(
  job: BullJob<TData>,
  queueName: string,
  handler: () => Promise<TResult>
): Promise<TResult> {
  const context = getJobTraceContext(job);

  // Если нет trace context в job data, просто выполняем handler
  if (!context) {
    return handler();
  }

  // Продолжаем существующий trace
  return runWithTraceContext(context, async () =>
    tracingService.withSpan(
      {
        name: `${queueName}:${job.name}`,
        kind: "consumer",
        attributes: {
          "queue.name": queueName,
          "job.id": job.id,
          "job.name": job.name,
        },
      },
      async () => handler()
    )
  );
}

/**
 * Создает span для отправки job в очередь
 */
export async function traceJobEnqueue<T>(
  queueName: string,
  jobName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = getTraceContext();
  if (!context) {
    return fn();
  }

  return tracingService.withSpan(
    {
      name: `${queueName}.enqueue`,
      kind: "producer",
      attributes: {
        "queue.name": queueName,
        "job.name": jobName,
      },
    },
    async (span) => {
      const result = await fn();
      span.addEvent("job_enqueued");
      return result;
    }
  );
}
