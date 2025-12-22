import prisma from "@trender/db";
import type { AIProvider } from "@trender/db/enums";

type AILog = NonNullable<Awaited<ReturnType<typeof prisma.aILog.findFirst>>>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type AILogOptions = {
  provider: AIProvider;
  operation: string;
  model?: string;
  reelId?: string;
  generationId?: string;
};

export type AILogResult = {
  inputTokens?: number;
  outputTokens?: number;
  inputMeta?: Record<string, JsonValue>;
  outputMeta?: Record<string, JsonValue>;
};

export type AILogHandle = {
  success: (result?: AILogResult) => Promise<AILog>;
  fail: (error: Error, result?: AILogResult) => Promise<AILog>;
};

export type AILogsFilter = {
  provider?: AIProvider;
  operation?: string;
  status?: string;
  reelId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type AIMetrics = {
  provider: AIProvider;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgDuration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

class AILogger {
  /**
   * Начать логирование AI операции
   */
  async startTimer(options: AILogOptions): Promise<AILogHandle> {
    const startedAt = new Date();

    const log = await prisma.aILog.create({
      data: {
        provider: options.provider,
        operation: options.operation,
        model: options.model,
        reelId: options.reelId,
        generationId: options.generationId,
        status: "pending",
        startedAt,
      },
    });

    const prefix = `[AI:${options.provider}]`;
    console.log(
      `${prefix} Started: ${options.operation}${options.model ? ` (${options.model})` : ""}`
    );

    return {
      success: async (result?: AILogResult) => {
        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();

        const updated = await prisma.aILog.update({
          where: { id: log.id },
          data: {
            status: "success",
            completedAt,
            duration,
            inputTokens: result?.inputTokens,
            outputTokens: result?.outputTokens,
            inputMeta: result?.inputMeta as
              | Record<string, JsonValue>
              | undefined,
            outputMeta: result?.outputMeta as
              | Record<string, JsonValue>
              | undefined,
          },
        });

        console.log(
          `${prefix} Completed: ${options.operation} (${duration}ms)`
        );
        return updated;
      },
      fail: async (error: Error, result?: AILogResult) => {
        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();

        const updated = await prisma.aILog.update({
          where: { id: log.id },
          data: {
            status: "error",
            error: error.message,
            completedAt,
            duration,
            inputTokens: result?.inputTokens,
            outputTokens: result?.outputTokens,
            inputMeta: result?.inputMeta as
              | Record<string, JsonValue>
              | undefined,
            outputMeta: result?.outputMeta as
              | Record<string, JsonValue>
              | undefined,
          },
        });

        console.error(
          `${prefix} Failed: ${options.operation} - ${error.message} (${duration}ms)`
        );
        return updated;
      },
    };
  }

  /**
   * Получить AI логи с фильтрацией
   */
  async getAILogs(filter: AILogsFilter = {}): Promise<AILog[]> {
    const where: NonNullable<
      Parameters<typeof prisma.aILog.findMany>[0]
    >["where"] = {};

    if (filter.provider) where.provider = filter.provider;
    if (filter.operation) where.operation = filter.operation;
    if (filter.status) where.status = filter.status;
    if (filter.reelId) where.reelId = filter.reelId;

    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }

    return prisma.aILog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
      skip: filter.offset ?? 0,
    });
  }

  /**
   * Получить метрики AI по провайдерам
   */
  async getAIMetrics(from?: Date, to?: Date): Promise<AIMetrics[]> {
    const where: NonNullable<
      Parameters<typeof prisma.aILog.findMany>[0]
    >["where"] = {};

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const logs = await prisma.aILog.findMany({
      where,
      select: {
        provider: true,
        status: true,
        duration: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    const metricsMap = new Map<AIProvider, AIMetrics>();

    for (const log of logs) {
      const existing = metricsMap.get(log.provider) ?? {
        provider: log.provider,
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        avgDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      };

      existing.totalCalls += 1;
      if (log.status === "success") existing.successCalls += 1;
      if (log.status === "error") existing.errorCalls += 1;
      existing.avgDuration += log.duration ?? 0;
      existing.totalInputTokens += log.inputTokens ?? 0;
      existing.totalOutputTokens += log.outputTokens ?? 0;

      metricsMap.set(log.provider, existing);
    }

    // Рассчитываем средние значения
    const metrics = Array.from(metricsMap.values());
    for (const m of metrics) {
      if (m.totalCalls > 0) {
        m.avgDuration = Math.round(m.avgDuration / m.totalCalls);
      }
    }

    return metrics;
  }

  /**
   * Получить статистику за период
   */
  async getStats(from?: Date, to?: Date) {
    const where: NonNullable<
      Parameters<typeof prisma.aILog.count>[0]
    >["where"] = {};

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [total, success, errors] = await Promise.all([
      prisma.aILog.count({ where }),
      prisma.aILog.count({ where: { ...where, status: "success" } }),
      prisma.aILog.count({ where: { ...where, status: "error" } }),
    ]);

    return { total, success, errors };
  }

  /**
   * Очистить старые логи
   */
  async cleanupOldLogs(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.aILog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}

export const aiLogger = new AILogger();
