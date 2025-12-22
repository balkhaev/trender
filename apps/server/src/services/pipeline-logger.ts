import prisma from "@trender/db";
import type { LogLevel } from "@trender/db/enums";

type ReelLog = NonNullable<
  Awaited<ReturnType<typeof prisma.reelLog.findFirst>>
>;

export type PipelineStage = "scrape" | "download" | "analyze" | "generate";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type LogMetadata = {
  progress?: number;
  total?: number;
  fileSize?: number;
  filePath?: string;
  error?: string;
  stack?: string;
} & Record<string, JsonValue | undefined>;

export type TimerHandle = {
  stop: (message?: string, metadata?: LogMetadata) => Promise<ReelLog>;
  fail: (error: Error, metadata?: LogMetadata) => Promise<ReelLog>;
};

type LogOptions = {
  reelId: string;
  stage: PipelineStage;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  duration?: number;
};

type BaseLogOptions = Omit<LogOptions, "level" | "duration">;

type ErrorLogOptions = BaseLogOptions & {
  error?: Error;
};

class PipelineLogger {
  /**
   * Логировать событие для рила
   */
  async log({
    reelId,
    stage,
    level,
    message,
    metadata,
    duration,
  }: LogOptions): Promise<ReelLog> {
    const log = await prisma.reelLog.create({
      data: {
        reelId,
        stage,
        level,
        message,
        metadata: metadata as Record<string, JsonValue> | undefined,
        duration,
      },
    });

    // Также выводим в консоль для отладки
    const prefix = `[${stage.toUpperCase()}] [${level}]`;
    const durationStr = duration ? ` (${duration}ms)` : "";
    console.log(`${prefix} ${reelId}: ${message}${durationStr}`);

    return log;
  }

  /**
   * Быстрые методы для разных уровней логирования
   */
  debug({
    reelId,
    stage,
    message,
    metadata,
  }: BaseLogOptions): Promise<ReelLog> {
    return this.log({ reelId, stage, level: "debug", message, metadata });
  }

  info({ reelId, stage, message, metadata }: BaseLogOptions): Promise<ReelLog> {
    return this.log({ reelId, stage, level: "info", message, metadata });
  }

  warn({ reelId, stage, message, metadata }: BaseLogOptions): Promise<ReelLog> {
    return this.log({ reelId, stage, level: "warn", message, metadata });
  }

  error({
    reelId,
    stage,
    message,
    metadata,
    error,
  }: ErrorLogOptions): Promise<ReelLog> {
    const errorMetadata: LogMetadata = {
      ...metadata,
      error: error?.message,
      stack: error?.stack,
    };
    return this.log({
      reelId,
      stage,
      level: "error",
      message,
      metadata: errorMetadata,
    });
  }

  /**
   * Запустить таймер для измерения длительности операции
   */
  startTimer(
    reelId: string,
    stage: PipelineStage,
    message: string
  ): TimerHandle {
    const startTime = Date.now();

    // Логируем начало операции
    this.debug({ reelId, stage, message: `Started: ${message}` });

    return {
      stop: (endMessage?: string, metadata?: LogMetadata) => {
        const duration = Date.now() - startTime;
        return this.log({
          reelId,
          stage,
          level: "info",
          message: endMessage ?? `Completed: ${message}`,
          metadata,
          duration,
        });
      },
      fail: (error: Error, metadata?: LogMetadata) => {
        const duration = Date.now() - startTime;
        return this.log({
          reelId,
          stage,
          level: "error",
          message: `Failed: ${message} - ${error.message}`,
          metadata: { ...metadata, error: error.message, stack: error.stack },
          duration,
        });
      },
    };
  }

  /**
   * Получить все логи для рила
   */
  getReelLogs(reelId: string, limit = 100): Promise<ReelLog[]> {
    return prisma.reelLog.findMany({
      where: { reelId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  /**
   * Получить логи по этапу
   */
  getLogsByStage(reelId: string, stage: PipelineStage): Promise<ReelLog[]> {
    return prisma.reelLog.findMany({
      where: { reelId, stage },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Получить последние ошибки
   */
  getRecentErrors(reelId: string, limit = 10): Promise<ReelLog[]> {
    return prisma.reelLog.findMany({
      where: { reelId, level: "error" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Получить статистику по этапам
   */
  async getStageStats(reelId: string): Promise<
    {
      stage: string;
      count: number;
      totalDuration: number;
      errors: number;
    }[]
  > {
    const logs = await prisma.reelLog.findMany({
      where: { reelId },
      select: {
        stage: true,
        level: true,
        duration: true,
      },
    });

    const statsMap = new Map<
      string,
      { count: number; totalDuration: number; errors: number }
    >();

    for (const log of logs) {
      const existing = statsMap.get(log.stage) ?? {
        count: 0,
        totalDuration: 0,
        errors: 0,
      };

      existing.count += 1;
      existing.totalDuration += log.duration ?? 0;
      if (log.level === "error") {
        existing.errors += 1;
      }

      statsMap.set(log.stage, existing);
    }

    return Array.from(statsMap.entries()).map(([stage, stats]) => ({
      stage,
      ...stats,
    }));
  }

  /**
   * Очистить старые логи
   */
  async cleanupOldLogs(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.reelLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}

// Singleton instance
export const pipelineLogger = new PipelineLogger();
