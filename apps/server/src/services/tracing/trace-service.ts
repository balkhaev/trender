import { randomUUID } from "node:crypto";
import prisma from "@trender/db";
import { getTraceContext, runWithTraceContext } from "./context";
import type {
  SpanHandle,
  SpanOptions,
  SpanStatus,
  StartTraceOptions,
  TraceContext,
} from "./types";

type PendingSpanData = {
  events: Array<{
    name: string;
    timestamp: string;
    attributes?: Record<string, unknown>;
  }>;
  attributes: Record<string, unknown>;
  status?: SpanStatus;
  errorMessage?: string;
};

class TracingService {
  private pendingSpanUpdates: Map<string, PendingSpanData> = new Map();

  generateTraceId(): string {
    return randomUUID();
  }

  generateSpanId(): string {
    return randomUUID().slice(0, 16);
  }

  async startTrace(
    options: StartTraceOptions
  ): Promise<{ traceId: string; spanId: string }> {
    const traceId = options.traceId ?? this.generateTraceId();
    const spanId = this.generateSpanId();

    await prisma.trace.create({
      data: {
        traceId,
        name: options.name,
        rootService: options.rootService ?? "server",
        rootPath: options.rootPath,
        userId: options.userId,
        metadata: options.metadata as object,
        startedAt: new Date(),
        status: "unset",
      },
    });

    return { traceId, spanId };
  }

  async endTrace(
    traceId: string,
    status: SpanStatus = "ok",
    errorMessage?: string
  ): Promise<void> {
    const trace = await prisma.trace.findUnique({ where: { traceId } });
    if (!trace) return;

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - trace.startedAt.getTime();

    await prisma.trace.update({
      where: { traceId },
      data: {
        endedAt,
        durationMs,
        status,
        errorMessage,
      },
    });
  }

  async startSpan(options: SpanOptions): Promise<SpanHandle> {
    const context = getTraceContext();
    if (!context) {
      throw new Error("No trace context found. Call startTrace first.");
    }

    const spanId = this.generateSpanId();
    const parentSpanId = options.parentSpanId ?? context.spanId;

    await prisma.traceSpan.create({
      data: {
        traceId: context.traceId,
        spanId,
        parentSpanId,
        name: options.name,
        kind: options.kind ?? "internal",
        service: options.service ?? "server",
        startedAt: new Date(),
        status: "unset",
        attributes: options.attributes as object,
      },
    });

    this.pendingSpanUpdates.set(spanId, {
      events: [],
      attributes: options.attributes ?? {},
    });

    const handle: SpanHandle = {
      spanId,
      traceId: context.traceId,

      addEvent: (name: string, attrs?: Record<string, unknown>) => {
        const pending = this.pendingSpanUpdates.get(spanId);
        if (pending) {
          pending.events.push({
            name,
            timestamp: new Date().toISOString(),
            attributes: attrs,
          });
        }
      },

      setAttribute: (key: string, value: unknown) => {
        const pending = this.pendingSpanUpdates.get(spanId);
        if (pending) {
          pending.attributes[key] = value;
        }
      },

      setStatus: (status: SpanStatus, errorMessage?: string) => {
        const pending = this.pendingSpanUpdates.get(spanId);
        if (pending) {
          pending.status = status;
          pending.errorMessage = errorMessage;
        }
      },

      end: async () => {
        const pending = this.pendingSpanUpdates.get(spanId);
        const span = await prisma.traceSpan.findFirst({
          where: { traceId: context.traceId, spanId },
        });

        if (!span) return;

        const endedAt = new Date();
        const durationMs = endedAt.getTime() - span.startedAt.getTime();

        await prisma.traceSpan.update({
          where: { id: span.id },
          data: {
            endedAt,
            durationMs,
            status: pending?.status ?? "ok",
            errorMessage: pending?.errorMessage,
            attributes: pending?.attributes as object,
            events: pending?.events as unknown[],
          },
        });

        this.pendingSpanUpdates.delete(spanId);
      },
    };

    return handle;
  }

  async withSpan<T>(
    options: SpanOptions,
    fn: (span: SpanHandle) => Promise<T>
  ): Promise<T> {
    const context = getTraceContext();
    if (!context) {
      // No trace context - just run the function
      return fn({
        spanId: "",
        traceId: "",
        addEvent: () => {},
        setAttribute: () => {},
        setStatus: () => {},
        end: async () => {},
      });
    }

    const span = await this.startSpan(options);

    const newContext: TraceContext = {
      traceId: context.traceId,
      spanId: span.spanId,
      parentSpanId: context.spanId,
    };

    try {
      const result = await runWithTraceContext(newContext, () => fn(span));
      span.setStatus("ok");
      await span.end();
      return result;
    } catch (error) {
      span.setStatus(
        "error",
        error instanceof Error ? error.message : String(error)
      );
      await span.end();
      throw error;
    }
  }

  async getTrace(traceId: string) {
    return prisma.trace.findUnique({
      where: { traceId },
      include: {
        spans: {
          orderBy: { startedAt: "asc" },
        },
      },
    });
  }

  async getTraces(
    options: {
      limit?: number;
      offset?: number;
      status?: SpanStatus;
      service?: string;
      from?: Date;
      to?: Date;
    } = {}
  ) {
    const where: {
      status?: SpanStatus;
      rootService?: string;
      startedAt?: { gte?: Date; lte?: Date };
    } = {};

    if (options.status) where.status = options.status;
    if (options.service) where.rootService = options.service;
    if (options.from || options.to) {
      where.startedAt = {};
      if (options.from) where.startedAt.gte = options.from;
      if (options.to) where.startedAt.lte = options.to;
    }

    const [traces, total] = await Promise.all([
      prisma.trace.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
        include: {
          _count: { select: { spans: true } },
        },
      }),
      prisma.trace.count({ where }),
    ]);

    return { traces, total };
  }

  async cleanup(olderThanDays = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await prisma.trace.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return result.count;
  }
}

export const tracingService = new TracingService();
