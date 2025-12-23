import prisma from "@trender/db";
import type { ReelStatus } from "@trender/db/enums";
import { pipelineLogger } from "./pipeline-logger";

// Prisma model types inferred from client
type Reel = NonNullable<Awaited<ReturnType<typeof prisma.reel.findFirst>>>;
type ReelLog = NonNullable<
  Awaited<ReturnType<typeof prisma.reelLog.findFirst>>
>;
type Template = NonNullable<
  Awaited<ReturnType<typeof prisma.template.findFirst>>
>;
type VideoAnalysis = NonNullable<
  Awaited<ReturnType<typeof prisma.videoAnalysis.findFirst>>
>;

export type ProcessOptions = {
  skipDownload?: boolean;
  skipAnalysis?: boolean;
  forceReprocess?: boolean;
  /** Use frame-by-frame analysis instead of full video upload */
  useFrames?: boolean;
};

export type ReelWithDetails = Reel & {
  logs: ReelLog[];
  template:
    | (Template & {
        analysis: VideoAnalysis;
      })
    | null;
};

class ReelPipeline {
  /**
   * Обновить статус рила
   */
  async updateStatus(
    reelId: string,
    status: ReelStatus,
    errorMessage?: string
  ): Promise<Reel> {
    const reel = await prisma.reel.update({
      where: { id: reelId },
      data: {
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      },
    });

    await pipelineLogger.info({
      reelId,
      stage: "scrape",
      message: `Status changed to: ${status}`,
    });

    return reel;
  }

  /**
   * Обновить прогресс рила (для отображения на фронте)
   */
  async updateProgress(
    reelId: string,
    stage: string,
    percent: number,
    message: string
  ): Promise<void> {
    await prisma.reel.update({
      where: { id: reelId },
      data: {
        progress: percent,
        progressStage: stage,
        progressMessage: message,
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * Скачать видео для рила
   * Делегирует работу VideoDownloadService
   */
  async downloadReel(reelId: string): Promise<string> {
    const { videoDownloadService } = await import("./video");

    const result = await videoDownloadService.downloadReel(reelId, {
      updateStatus: this.updateStatus.bind(this),
      updateProgress: this.updateProgress.bind(this),
    });

    return result.path;
  }

  /**
   * Анализировать видео рила
   * Использует scene-based анализ (PySceneDetect + Gemini по сценам)
   */
  async analyzeReel(reelId: string): Promise<VideoAnalysis> {
    const { sceneAnalysisService } = await import(
      "./analysis/scene-analysis.service"
    );

    return sceneAnalysisService.analyzeReelWithScenes(reelId, {
      updateStatus: this.updateStatus.bind(this),
      updateProgress: this.updateProgress.bind(this),
    });
  }

  /**
   * Анализировать видео рила по кадрам
   * Делегирует работу VideoAnalysisService
   */
  async analyzeReelByFrames(reelId: string): Promise<VideoAnalysis> {
    const { videoAnalysisService } = await import("./analysis");

    return videoAnalysisService.analyzeReelByFrames(reelId, {
      updateStatus: this.updateStatus.bind(this),
      updateProgress: this.updateProgress.bind(this),
    });
  }

  /**
   * Анализировать видео рила в режиме Enchanting
   * Делегирует работу VideoAnalysisService
   */
  async analyzeReelEnchanting(reelId: string): Promise<VideoAnalysis> {
    const { videoAnalysisService } = await import("./analysis");

    return videoAnalysisService.analyzeReelEnchanting(reelId, {
      updateStatus: this.updateStatus.bind(this),
      updateProgress: this.updateProgress.bind(this),
    });
  }

  /**
   * Создать шаблон из анализа
   */
  async createTemplate(reelId: string, analysisId: string): Promise<Template> {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const timer = pipelineLogger.startTimer(
      reelId,
      "analyze",
      "Creating template"
    );

    try {
      // Генерируем теги из анализа
      const tags =
        analysis.tags.length > 0 ? analysis.tags : this.extractTags(analysis);

      const template = await prisma.template.upsert({
        where: { reelId },
        create: {
          reelId,
          analysisId,
          tags,
          category: this.detectCategory(analysis),
          isPublished: true,
        },
        update: {
          analysisId,
          tags,
          category: this.detectCategory(analysis),
        },
      });

      // Обновляем статус рила
      await prisma.reel.update({
        where: { id: reelId },
        data: { status: "analyzed" },
      });

      await timer.stop("Template created successfully", {
        templateId: template.id,
        tags,
      });

      return template;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await timer.fail(err);
      throw err;
    }
  }

  /**
   * Создать шаблон внутри транзакции (для атомарного пересоздания)
   */
  private async createTemplateInTransaction(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    reelId: string,
    analysisId: string
  ): Promise<Template> {
    const analysis = await tx.videoAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const tags =
      analysis.tags.length > 0 ? analysis.tags : this.extractTags(analysis);

    const template = await tx.template.create({
      data: {
        reelId,
        analysisId,
        tags,
        category: this.detectCategory(analysis),
        isPublished: true,
      },
    });

    await tx.reel.update({
      where: { id: reelId },
      data: { status: "analyzed" },
    });

    return template;
  }

  /**
   * Полная обработка рила: download -> analyze -> create template
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-stage pipeline orchestration with conditional logic
  async processReel(
    reelId: string,
    options: ProcessOptions = {}
  ): Promise<Template> {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: { template: true },
    });

    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    // Если уже обработан и не нужен reprocess
    if (reel.template && !options.forceReprocess) {
      await pipelineLogger.info({
        reelId,
        stage: "scrape",
        message: "Reel already processed, returning existing template",
      });
      return reel.template;
    }

    await pipelineLogger.info({
      reelId,
      stage: "scrape",
      message: "Starting full pipeline processing",
      metadata: {
        currentStatus: reel.status,
        options,
      },
    });

    // Шаг 1: Download (skip if already have file in S3 or locally)
    if (!(options.skipDownload || reel.s3Key || reel.localPath)) {
      await this.downloadReel(reelId);
    }

    // Шаг 2: Analyze
    let analysis: VideoAnalysis | null = null;
    if (!options.skipAnalysis) {
      // Проверяем, есть ли уже анализ
      const existingAnalysis = await prisma.videoAnalysis.findFirst({
        where: { sourceId: reelId, sourceType: "reel" },
      });

      if (existingAnalysis && !options.forceReprocess) {
        analysis = existingAnalysis;
        await pipelineLogger.info({
          reelId,
          stage: "analyze",
          message: "Using existing analysis",
        });
      } else if (options.useFrames) {
        // Выбираем метод анализа: по кадрам или полное видео
        await pipelineLogger.info({
          reelId,
          stage: "analyze",
          message: "Using frame-by-frame analysis",
        });
        analysis = await this.analyzeReelByFrames(reelId);
      } else {
        analysis = await this.analyzeReel(reelId);
      }
    }

    if (!analysis) {
      throw new Error("Analysis is required to create template");
    }

    // Шаг 3: Create Template
    let template = await prisma.template.findUnique({
      where: { reelId },
    });

    if (!template || options.forceReprocess) {
      // Используем транзакцию для атомарного удаления старого и создания нового шаблона
      if (template) {
        // Удаляем старый шаблон и создаём новый в транзакции
        const newTemplate = await prisma.$transaction(async (tx) => {
          await tx.template.delete({ where: { id: template!.id } });
          return this.createTemplateInTransaction(tx, reelId, analysis.id);
        });
        template = newTemplate;
      } else {
        template = await this.createTemplate(reelId, analysis.id);
      }
    }

    await pipelineLogger.info({
      reelId,
      stage: "scrape",
      message: "Pipeline completed successfully",
      metadata: { templateId: template.id },
    });

    return template;
  }

  /**
   * Получить рил со всеми деталями
   */
  async getReelWithDetails(reelId: string): Promise<ReelWithDetails | null> {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        logs: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
        template: {
          include: {
            analysis: true,
          },
        },
      },
    });

    return reel;
  }

  /**
   * Извлечь теги из анализа
   */
  private extractTags(analysis: VideoAnalysis): string[] {
    const tags: string[] = [];
    const text =
      `${analysis.subject} ${analysis.environment} ${analysis.style}`.toLowerCase();

    const tagKeywords: Record<string, string[]> = {
      travel: ["travel", "journey", "adventure", "destination", "tourist"],
      lifestyle: ["lifestyle", "daily", "routine", "life"],
      food: ["food", "cooking", "restaurant", "meal", "kitchen"],
      fashion: ["fashion", "outfit", "clothes", "style", "wear"],
      fitness: ["fitness", "workout", "gym", "exercise", "training"],
      nature: ["nature", "outdoor", "landscape", "mountain", "forest", "beach"],
      urban: ["city", "urban", "street", "downtown", "building"],
      cinematic: ["cinematic", "film", "movie", "dramatic"],
      tutorial: ["tutorial", "how-to", "guide", "learn"],
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) {
        tags.push(tag);
      }
    }

    return tags.length > 0 ? tags : ["general"];
  }

  /**
   * Определить категорию
   */
  private detectCategory(analysis: VideoAnalysis): string {
    const style = analysis.style.toLowerCase();

    if (style.includes("cinematic") || style.includes("film")) {
      return "cinematic";
    }
    if (style.includes("commercial") || style.includes("advertisement")) {
      return "commercial";
    }
    if (style.includes("tutorial") || style.includes("how-to")) {
      return "tutorial";
    }
    if (style.includes("music video")) {
      return "music";
    }
    if (style.includes("documentary")) {
      return "documentary";
    }
    if (style.includes("social") || style.includes("vertical")) {
      return "social";
    }

    return "viral";
  }
}

// Singleton instance
export const reelPipeline = new ReelPipeline();
