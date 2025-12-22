import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import type { ReelStatus } from "@trender/db/enums";
import {
  type VideoAnalysis as GeminiAnalysis,
  type GeminiProgressCallback,
  getGeminiService,
} from "./gemini";
import { getDownloadsPath } from "./instagram/downloader";
import { pipelineLogger } from "./pipeline-logger";
import { getS3Key, isS3Configured, s3Service } from "./s3";

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

const INSTALOADER_SERVICE_URL =
  process.env.SCRAPPER_SERVICE_URL ||
  process.env.INSTALOADER_SERVICE_URL ||
  "http://localhost:8001";

const VIDEO_FRAMES_SERVICE_URL =
  process.env.VIDEO_FRAMES_SERVICE_URL || "http://localhost:8002";

const FRAME_INTERVAL_SEC = Number.parseFloat(
  process.env.FRAME_INTERVAL_SEC || "2.0"
);

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

    await pipelineLogger.debug({
      reelId,
      stage: stage as "scrape" | "download" | "analyze" | "generate",
      message: `Progress: ${percent}% - ${message}`,
    });
  }

  /**
   * Создать callback для обновления прогресса рила
   */
  private createProgressCallback(reelId: string): GeminiProgressCallback {
    return async (stage: string, percent: number, message: string) => {
      await this.updateProgress(reelId, stage, percent, message);
    };
  }

  /**
   * Скачать видео для рила
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex download workflow with S3/local fallback and progress updates
  async downloadReel(reelId: string): Promise<string> {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    // Обновляем статус и прогресс
    await this.updateStatus(reelId, "downloading");
    await this.updateProgress(
      reelId,
      "download",
      0,
      "Начало загрузки видео..."
    );

    const timer = pipelineLogger.startTimer(
      reelId,
      "download",
      "Downloading video"
    );

    try {
      // Используем hashtag если есть, иначе source - должно совпадать с URL на фронте
      const folder = reel.hashtag || reel.source;
      const outputDir = getDownloadsPath(folder);
      const filename = `${reelId}.mp4`;
      const filepath = join(outputDir, filename);

      // Получаем метаданные рила
      await this.updateProgress(
        reelId,
        "download",
        5,
        "Получение метаданных..."
      );

      try {
        const metadataResponse = await fetch(
          `${INSTALOADER_SERVICE_URL}/metadata`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shortcode: reelId }),
          }
        );

        if (metadataResponse.ok) {
          const metadata = (await metadataResponse.json()) as {
            success: boolean;
            caption?: string;
            commentCount?: number;
            likeCount?: number;
            viewCount?: number;
            author?: string;
            thumbnailUrl?: string;
          };

          if (metadata.success) {
            await prisma.reel.update({
              where: { id: reelId },
              data: {
                caption: metadata.caption ?? null,
                commentCount: metadata.commentCount ?? null,
                likeCount: metadata.likeCount ?? null,
                viewCount: metadata.viewCount ?? null,
                author: metadata.author ?? null,
                thumbnailUrl: metadata.thumbnailUrl ?? null,
              },
            });

            await pipelineLogger.debug({
              reelId,
              stage: "download",
              message: "Metadata fetched and saved",
              metadata: {
                likeCount: metadata.likeCount,
                viewCount: metadata.viewCount,
                author: metadata.author,
              },
            });
          }
        }
      } catch (metaError) {
        // Метаданные не критичны, продолжаем скачивание
        console.warn(`Failed to fetch metadata for ${reelId}:`, metaError);
      }

      // Скачиваем через instaloader service
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2min timeout

      await this.updateProgress(reelId, "download", 15, "Скачивание видео...");

      await pipelineLogger.debug({
        reelId,
        stage: "download",
        message: "Calling instaloader service",
        metadata: { url: INSTALOADER_SERVICE_URL },
      });

      const response = await fetch(`${INSTALOADER_SERVICE_URL}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortcode: reelId }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("video/mp4")) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(
          errorData.error || `Download failed: ${response.status}`
        );
      }

      await this.updateProgress(reelId, "download", 50, "Получение видео...");

      const videoBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(videoBuffer);
      const s3Key = getS3Key("reels", reelId);

      await this.updateProgress(
        reelId,
        "download",
        70,
        `Видео загружено (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`
      );

      // Upload to S3 if configured
      if (isS3Configured()) {
        try {
          await this.updateProgress(
            reelId,
            "uploading",
            80,
            "Загрузка в облачное хранилище..."
          );

          await s3Service.uploadFile(s3Key, buffer, "video/mp4");

          // Update database with s3Key
          await prisma.reel.update({
            where: { id: reelId },
            data: {
              status: "downloaded",
              s3Key,
              localPath: null,
              progress: 100,
              progressStage: "download",
              progressMessage: "Загрузка завершена",
              lastActivityAt: new Date(),
            },
          });

          await timer.stop("Video downloaded and uploaded to S3", {
            fileSize: videoBuffer.byteLength,
            s3Key,
          });

          return s3Key;
        } catch (s3Error) {
          console.error(`S3 upload failed for ${reelId}:`, s3Error);
          // Fall through to local storage
        }
      }

      // Fall back to local storage
      await this.updateProgress(
        reelId,
        "download",
        90,
        "Сохранение на диск..."
      );

      await mkdir(outputDir, { recursive: true });
      await writeFile(filepath, buffer);

      await prisma.reel.update({
        where: { id: reelId },
        data: {
          status: "downloaded",
          localPath: filepath,
          progress: 100,
          progressStage: "download",
          progressMessage: "Загрузка завершена",
          lastActivityAt: new Date(),
        },
      });

      await timer.stop("Video downloaded successfully", {
        fileSize: videoBuffer.byteLength,
        filePath: filepath,
      });

      return filepath;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.updateProgress(
        reelId,
        "download",
        0,
        `Ошибка: ${err.message}`
      );
      await timer.fail(err);
      await this.updateStatus(reelId, "failed", err.message);
      throw err;
    }
  }

  /**
   * Анализировать видео рила
   */
  async analyzeReel(reelId: string): Promise<VideoAnalysis> {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    if (!(reel.s3Key || reel.localPath)) {
      throw new Error(
        `Reel ${reelId} has no video file (neither S3 nor local). Download first.`
      );
    }

    // Обновляем статус и прогресс
    await this.updateStatus(reelId, "analyzing");
    await this.updateProgress(reelId, "analyze", 0, "Начало анализа...");

    const timer = pipelineLogger.startTimer(
      reelId,
      "analyze",
      "Analyzing video with Gemini"
    );

    // Создаём callback для обновления прогресса
    const onProgress = this.createProgressCallback(reelId);

    try {
      // Читаем файл из S3 или локально
      let buffer: Buffer;

      await onProgress("analyze", 2, "Загрузка видеофайла...");

      if (reel.s3Key) {
        await pipelineLogger.debug({
          reelId,
          stage: "analyze",
          message: "Downloading video from S3",
          metadata: { s3Key: reel.s3Key },
        });

        const s3Buffer = await s3Service.downloadFile(reel.s3Key);
        if (!s3Buffer) {
          throw new Error(`Failed to download video from S3: ${reel.s3Key}`);
        }
        buffer = s3Buffer;
      } else if (reel.localPath) {
        buffer = await readFile(reel.localPath);
      } else {
        throw new Error("No video file available");
      }

      await pipelineLogger.debug({
        reelId,
        stage: "analyze",
        message: "Uploading video to Gemini",
        metadata: { fileSize: buffer.length },
      });

      // Анализируем через Gemini с callback для прогресса
      const geminiService = getGeminiService();
      const analysis: GeminiAnalysis = await geminiService.processVideo(
        buffer,
        "video/mp4",
        `${reelId}.mp4`,
        onProgress
      );

      await pipelineLogger.debug({
        reelId,
        stage: "analyze",
        message: "Analysis received",
        metadata: { promptLength: analysis.klingPrompt.length },
      });

      await onProgress("analyze", 95, "Сохранение результатов анализа...");

      // Сохраняем в БД
      const savedAnalysis = await prisma.videoAnalysis.create({
        data: {
          sourceType: "reel",
          sourceId: reelId,
          fileName: `${reelId}.mp4`,
          analysisType: "standard",
          // Quick mode fields
          subject: analysis.subject,
          action: analysis.action,
          environment: analysis.environment,
          cameraStyle: analysis.cameraStyle,
          mood: analysis.mood,
          colorPalette: analysis.colorPalette,
          style: analysis.style,
          duration: analysis.duration,
          aspectRatio: analysis.aspectRatio,
          // Pro mode fields
          scenes: analysis.scenes,
          characters: analysis.characters,
          objects: analysis.objects,
          cameraMovements: analysis.cameraMovements,
          lighting: analysis.lighting,
          transitions: analysis.transitions,
          audio: analysis.audio,
          textOverlays: analysis.textOverlays,
          // Legacy fields
          pacing: analysis.pacing,
          cameraWork: analysis.cameraWork,
          // Prompts
          klingPrompt: analysis.klingPrompt,
          veo3Prompt: analysis.veo3Prompt,
          tags: analysis.tags,
        },
      });

      await onProgress("analyze", 100, "Анализ завершён");
      await timer.stop("Video analyzed successfully (standard)");

      return savedAnalysis;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.updateProgress(reelId, "analyze", 0, `Ошибка: ${err.message}`);
      await timer.fail(err);
      await this.updateStatus(reelId, "failed", err.message);
      throw err;
    }
  }

  /**
   * Анализировать видео рила по кадрам
   * Извлекает кадры через video-frames сервис и анализирует их через Gemini
   */
  async analyzeReelByFrames(reelId: string): Promise<VideoAnalysis> {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    if (!(reel.s3Key || reel.localPath)) {
      throw new Error(
        `Reel ${reelId} has no video file (neither S3 nor local). Download first.`
      );
    }

    // Обновляем статус и прогресс
    await this.updateStatus(reelId, "analyzing");
    await this.updateProgress(
      reelId,
      "analyze",
      0,
      "Начало анализа по кадрам..."
    );

    const timer = pipelineLogger.startTimer(
      reelId,
      "analyze",
      "Analyzing video by frames with Gemini"
    );

    // Создаём callback для обновления прогресса
    const onProgress = this.createProgressCallback(reelId);

    try {
      // Читаем файл из S3 или локально
      let buffer: Buffer;

      await onProgress("analyze", 2, "Загрузка видеофайла...");

      if (reel.s3Key) {
        await pipelineLogger.debug({
          reelId,
          stage: "analyze",
          message: "Downloading video from S3 for frame extraction",
          metadata: { s3Key: reel.s3Key },
        });

        const s3Buffer = await s3Service.downloadFile(reel.s3Key);
        if (!s3Buffer) {
          throw new Error(`Failed to download video from S3: ${reel.s3Key}`);
        }
        buffer = s3Buffer;
      } else if (reel.localPath) {
        buffer = await readFile(reel.localPath);
      } else {
        throw new Error("No video file available");
      }

      await onProgress("processing", 5, "Извлечение кадров из видео...");

      await pipelineLogger.debug({
        reelId,
        stage: "analyze",
        message: "Extracting frames via video-frames service",
        metadata: {
          fileSize: buffer.length,
          serviceUrl: VIDEO_FRAMES_SERVICE_URL,
          intervalSec: FRAME_INTERVAL_SEC,
        },
      });

      // Извлекаем кадры через video-frames сервис
      const formData = new FormData();
      formData.append(
        "video",
        new Blob([new Uint8Array(buffer)], { type: "video/mp4" }),
        `${reelId}.mp4`
      );
      formData.append("interval_sec", FRAME_INTERVAL_SEC.toString());

      const framesResponse = await fetch(
        `${VIDEO_FRAMES_SERVICE_URL}/extract-frames`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!framesResponse.ok) {
        const errorText = await framesResponse.text();
        throw new Error(`Failed to extract frames: ${errorText}`);
      }

      const framesData = (await framesResponse.json()) as {
        success: boolean;
        frames: string[];
        count: number;
        duration_sec: number | null;
        error?: string;
      };

      if (!framesData.success || framesData.frames.length === 0) {
        throw new Error(framesData.error || "No frames extracted from video");
      }

      await onProgress(
        "processing",
        40,
        `Извлечено ${framesData.count} кадров, начинаем анализ...`
      );

      await pipelineLogger.debug({
        reelId,
        stage: "analyze",
        message: "Frames extracted, analyzing with Gemini",
        metadata: {
          frameCount: framesData.count,
          durationSec: framesData.duration_sec,
        },
      });

      // Анализируем кадры через Gemini с callback для прогресса
      const geminiService = getGeminiService();
      const analysis: GeminiAnalysis = await geminiService.analyzeFrames(
        framesData.frames,
        onProgress
      );

      await pipelineLogger.debug({
        reelId,
        stage: "analyze",
        message: "Frame analysis received",
        metadata: {
          promptLength: analysis.klingPrompt.length,
          frameCount: framesData.count,
        },
      });

      await onProgress("analyze", 95, "Сохранение результатов анализа...");

      // Сохраняем в БД
      const savedAnalysis = await prisma.videoAnalysis.create({
        data: {
          sourceType: "reel",
          sourceId: reelId,
          fileName: `${reelId}.mp4`,
          analysisType: "frames",
          // Quick mode fields
          subject: analysis.subject,
          action: analysis.action,
          environment: analysis.environment,
          cameraStyle: analysis.cameraStyle,
          mood: analysis.mood,
          colorPalette: analysis.colorPalette,
          style: analysis.style,
          duration: analysis.duration,
          aspectRatio: analysis.aspectRatio,
          // Pro mode fields
          scenes: analysis.scenes,
          characters: analysis.characters,
          objects: analysis.objects,
          cameraMovements: analysis.cameraMovements,
          lighting: analysis.lighting,
          transitions: analysis.transitions,
          audio: analysis.audio,
          textOverlays: analysis.textOverlays,
          // Legacy fields
          pacing: analysis.pacing,
          cameraWork: analysis.cameraWork,
          // Prompts
          klingPrompt: analysis.klingPrompt,
          veo3Prompt: analysis.veo3Prompt,
          tags: analysis.tags,
        },
      });

      await onProgress("analyze", 100, "Анализ по кадрам завершён");
      await timer.stop("Video analyzed by frames successfully", {
        frameCount: framesData.count,
      });

      return savedAnalysis;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.updateProgress(reelId, "analyze", 0, `Ошибка: ${err.message}`);
      await timer.fail(err);
      await this.updateStatus(reelId, "failed", err.message);
      throw err;
    }
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

      const template = await prisma.template.create({
        data: {
          reelId,
          analysisId,
          tags,
          category: this.detectCategory(analysis),
          isPublished: true,
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
      // Удаляем старый шаблон если есть
      if (template) {
        await prisma.template.delete({ where: { id: template.id } });
      }
      template = await this.createTemplate(reelId, analysis.id);
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
