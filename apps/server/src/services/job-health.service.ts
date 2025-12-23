/**
 * Job Health Service
 * Отслеживание здоровья job'ов для выявления зависаний и медленных операций
 */
import prisma from "@trender/db";

export type JobHealthStatus =
  | "healthy"
  | "slow"
  | "stalled"
  | "recovered"
  | "failed";

/**
 * Пороги для разных типов операций (в мс)
 */
export const DURATION_THRESHOLDS = {
  download: { expected: 60_000, slow: 120_000, stalled: 300_000 },
  analyze: { expected: 120_000, slow: 300_000, stalled: 600_000 },
  videoGenKling: { expected: 300_000, slow: 600_000, stalled: 1_800_000 },
  sceneGeneration: { expected: 300_000, slow: 600_000, stalled: 1_800_000 },
  compositeWaiting: { expected: 600_000, slow: 1_200_000, stalled: 1_800_000 },
  scrape: { expected: 300_000, slow: 600_000, stalled: 900_000 },
  fetch: { expected: 30_000, slow: 60_000, stalled: 120_000 },
} as const;

export type StalledJob = {
  id: string;
  queueName: string;
  jobId: string;
  entityId: string | null;
  entityType: string | null;
  substage: string | null;
  lastActivityAt: Date;
  minutesSinceActivity: number;
  startedAt: Date;
};

export type ProblematicJobs = {
  stalled: StalledJob[];
  slow: StalledJob[];
  recentFailures: Array<{
    id: string;
    queueName: string;
    jobId: string;
    entityId: string | null;
    completedAt: Date | null;
    alertMessage: string | null;
  }>;
};

class JobHealthService {
  /**
   * Начать отслеживание job
   */
  async startTracking(params: {
    queueName: string;
    jobId: string;
    entityId?: string;
    entityType?: string;
    expectedDurationMs?: number;
    substage?: string;
  }): Promise<string> {
    const log = await prisma.jobHealthLog.create({
      data: {
        queueName: params.queueName,
        jobId: params.jobId,
        entityId: params.entityId,
        entityType: params.entityType,
        status: "healthy",
        substage: params.substage,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        expectedDurationMs: params.expectedDurationMs,
      },
    });
    return log.id;
  }

  /**
   * Обновить heartbeat
   */
  async heartbeat(
    healthLogId: string,
    substage?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.jobHealthLog.update({
        where: { id: healthLogId },
        data: {
          lastActivityAt: new Date(),
          substage,
          metadata: metadata as object,
        },
      });
    } catch {
      // Ignore errors - health log might be already completed
    }
  }

  /**
   * Завершить отслеживание
   */
  async complete(
    healthLogId: string,
    status: "healthy" | "failed" = "healthy"
  ): Promise<void> {
    try {
      const log = await prisma.jobHealthLog.findUnique({
        where: { id: healthLogId },
      });

      if (!log) return;

      const actualDuration = Date.now() - log.startedAt.getTime();

      await prisma.jobHealthLog.update({
        where: { id: healthLogId },
        data: {
          status,
          completedAt: new Date(),
          actualDurationMs: actualDuration,
          lastActivityAt: new Date(),
        },
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Получить зависшие jobs (по lastActivityAt)
   */
  async getStalledJobs(thresholdMinutes = 5): Promise<StalledJob[]> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const stalledLogs = await prisma.jobHealthLog.findMany({
      where: {
        completedAt: null, // не завершены
        lastActivityAt: { lt: threshold },
      },
      orderBy: { lastActivityAt: "asc" },
    });

    return stalledLogs.map((log) => ({
      id: log.id,
      queueName: log.queueName,
      jobId: log.jobId,
      entityId: log.entityId,
      entityType: log.entityType,
      substage: log.substage,
      lastActivityAt: log.lastActivityAt,
      startedAt: log.startedAt,
      minutesSinceActivity: Math.floor(
        (Date.now() - log.lastActivityAt.getTime()) / 60_000
      ),
    }));
  }

  /**
   * Получить проблемные jobs для алертов
   */
  async getProblematicJobs(
    options: {
      stalledThresholdMinutes?: number;
      slowThresholdMultiplier?: number;
    } = {}
  ): Promise<ProblematicJobs> {
    const stalledThreshold = options.stalledThresholdMinutes ?? 5;
    const slowMultiplier = options.slowThresholdMultiplier ?? 2;

    const stalled = await this.getStalledJobs(stalledThreshold);

    // Slow jobs: running longer than expected * multiplier
    const slowLogs = await prisma.jobHealthLog.findMany({
      where: {
        completedAt: null,
        expectedDurationMs: { not: null },
      },
    });

    const slow: StalledJob[] = slowLogs
      .filter((log) => {
        const elapsed = Date.now() - log.startedAt.getTime();
        return (
          log.expectedDurationMs &&
          elapsed > log.expectedDurationMs * slowMultiplier
        );
      })
      .map((log) => ({
        id: log.id,
        queueName: log.queueName,
        jobId: log.jobId,
        entityId: log.entityId,
        entityType: log.entityType,
        substage: log.substage,
        lastActivityAt: log.lastActivityAt,
        startedAt: log.startedAt,
        minutesSinceActivity: Math.floor(
          (Date.now() - log.lastActivityAt.getTime()) / 60_000
        ),
      }));

    // Recent failures (last hour)
    const recentFailures = await prisma.jobHealthLog.findMany({
      where: {
        status: "failed",
        completedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        id: true,
        queueName: true,
        jobId: true,
        entityId: true,
        completedAt: true,
        alertMessage: true,
      },
    });

    return { stalled, slow, recentFailures };
  }

  /**
   * Получить активные jobs
   */
  async getActiveJobs(): Promise<
    Array<{
      id: string;
      queueName: string;
      jobId: string;
      entityId: string | null;
      entityType: string | null;
      substage: string | null;
      startedAt: Date;
      lastActivityAt: Date;
      durationMs: number;
    }>
  > {
    const activeLogs = await prisma.jobHealthLog.findMany({
      where: {
        completedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    return activeLogs.map((log) => ({
      id: log.id,
      queueName: log.queueName,
      jobId: log.jobId,
      entityId: log.entityId,
      entityType: log.entityType,
      substage: log.substage,
      startedAt: log.startedAt,
      lastActivityAt: log.lastActivityAt,
      durationMs: Date.now() - log.startedAt.getTime(),
    }));
  }

  /**
   * Очистка старых логов
   */
  async cleanup(olderThanDays = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await prisma.jobHealthLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return result.count;
  }

  /**
   * Статистика по очередям
   */
  async getQueueStats(): Promise<
    Record<
      string,
      {
        active: number;
        stalled: number;
        completedLast24h: number;
        failedLast24h: number;
        avgDurationMs: number | null;
      }
    >
  > {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const stalledThreshold = new Date(now.getTime() - 5 * 60 * 1000);

    // Get all queue names
    const queueNames = await prisma.jobHealthLog.findMany({
      distinct: ["queueName"],
      select: { queueName: true },
    });

    const stats: Record<
      string,
      {
        active: number;
        stalled: number;
        completedLast24h: number;
        failedLast24h: number;
        avgDurationMs: number | null;
      }
    > = {};

    for (const { queueName } of queueNames) {
      const [active, stalled, completed, failed, avgDuration] =
        await Promise.all([
          prisma.jobHealthLog.count({
            where: { queueName, completedAt: null },
          }),
          prisma.jobHealthLog.count({
            where: {
              queueName,
              completedAt: null,
              lastActivityAt: { lt: stalledThreshold },
            },
          }),
          prisma.jobHealthLog.count({
            where: {
              queueName,
              status: "healthy",
              completedAt: { gte: yesterday },
            },
          }),
          prisma.jobHealthLog.count({
            where: {
              queueName,
              status: "failed",
              completedAt: { gte: yesterday },
            },
          }),
          prisma.jobHealthLog.aggregate({
            where: {
              queueName,
              completedAt: { gte: yesterday },
              actualDurationMs: { not: null },
            },
            _avg: { actualDurationMs: true },
          }),
        ]);

      stats[queueName] = {
        active,
        stalled,
        completedLast24h: completed,
        failedLast24h: failed,
        avgDurationMs: avgDuration._avg.actualDurationMs,
      };
    }

    return stats;
  }
}

export const jobHealthService = new JobHealthService();
