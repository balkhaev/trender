/**
 * Kling AI OmniVideo Service
 * Video-to-video generation with reference video input
 *
 * API Documentation: https://app.klingai.com/global/dev/document-api/apiReference/model/OmniVideo
 * Default API URL: https://api-singapore.klingai.com/
 */

import jwt from "jsonwebtoken";
import { aiLogger } from "./ai-logger";

export type KlingGenerationResult = {
  success: boolean;
  videoUrl?: string;
  taskId?: string;
  error?: string;
};

/**
 * Image element for Kling multi-image reference
 * Used for subjects/characters with @Element1, @Element2 syntax
 */
export type KlingImageElement = {
  referenceImageUrls: string[];
  frontalImageUrl?: string;
};

export type KlingGenerationOptions = {
  duration?: number; // 1-10 seconds
  aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
  keepAudio?: boolean;
  negativePrompt?: string;
  mode?: "std" | "pro";
  /** Image URLs for @Image1, @Image2... references (style, background) */
  imageUrls?: string[];
  /** Elements for @Element1, @Element2... references (subjects/characters) */
  elements?: KlingImageElement[];
  /** Callback для обновления прогресса генерации */
  onProgress?: KlingProgressCallback;
  /** ID генерации для логирования */
  generationId?: string;
  /** ID рила для логирования */
  reelId?: string;
};

/**
 * Callback для отслеживания прогресса генерации Kling
 */
export type KlingProgressCallback = (
  status: KlingTaskStatus,
  progress: number | undefined,
  message: string
) => void | Promise<void>;

type KlingTaskCreateResponse = {
  code: number;
  message: string;
  data?: {
    task_id: string;
  };
};

// Official Kling API statuses: submitted, processing, succeed, failed
type KlingApiStatus = "submitted" | "processing" | "succeed" | "failed";
// Internal normalized status for callbacks
type KlingTaskStatus = "pending" | "processing" | "completed" | "failed";

type KlingTaskStatusResponse = {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: KlingApiStatus;
    task_status_msg?: string;
    task_result?: {
      videos?: {
        id: string;
        url: string;
        duration: string;
      }[];
    };
  };
};

// Map API status to internal status
function normalizeStatus(apiStatus: KlingApiStatus): KlingTaskStatus {
  switch (apiStatus) {
    case "submitted":
      return "pending";
    case "processing":
      return "processing";
    case "succeed":
      return "completed";
    case "failed":
      return "failed";
  }
}

const STATUS_EMOJI: Record<KlingTaskStatus, string> = {
  pending: "⏳",
  processing: "🔄",
  completed: "✅",
  failed: "❌",
};

const STATUS_RU: Record<KlingTaskStatus, string> = {
  pending: "В очереди",
  processing: "Генерация",
  completed: "Завершено",
  failed: "Ошибка",
};

const TRAILING_SLASH_REGEX = /\/+$/;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}м ${secs}с` : `${secs}с`;
}

/**
 * Generate JWT token for Kling API authentication
 * Token expires in 30 minutes
 */
function generateJwtToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256" as const,
    typ: "JWT",
  };
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 minutes
    nbf: now - 5, // Valid 5 seconds before current time
  };
  return jwt.sign(payload, secretKey, { algorithm: "HS256", header });
}

export class KlingService {
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private jwtToken: string | null = null;
  private jwtExpiry = 0;

  constructor(accessKey: string, secretKey: string, baseUrl?: string) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    // Default to Singapore API endpoint with /v1 prefix
    let url =
      baseUrl ||
      process.env.KLING_API_URL ||
      "https://api-singapore.klingai.com";
    // Remove trailing slash if present
    url = url.replace(TRAILING_SLASH_REGEX, "");
    // Ensure /v1 prefix is present
    if (!url.endsWith("/v1")) {
      url = `${url}/v1`;
    }
    this.baseUrl = url;
  }

  /**
   * Get valid JWT token (refresh if expired)
   */
  private getAuthToken(): string {
    const now = Math.floor(Date.now() / 1000);
    // Refresh token 60 seconds before expiry
    if (!this.jwtToken || now >= this.jwtExpiry - 60) {
      this.jwtToken = generateJwtToken(this.accessKey, this.secretKey);
      this.jwtExpiry = now + 1800;
      this.log("🔑", "JWT token refreshed");
    }
    return this.jwtToken;
  }

  private log(
    emoji: string,
    message: string,
    data?: Record<
      string,
      | string
      | number
      | boolean
      | null
      | { [key: string]: string | number | boolean | null }
      | (string | number | boolean | null)[]
      | undefined
    >
  ) {
    const timestamp = new Date().toISOString().slice(11, 19);
    const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
    console.log(`[${timestamp}] ${emoji} [Kling] ${message}${dataStr}`);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method ?? "GET";

    this.log("📡", `${method} ${endpoint}`);

    const token = this.getAuthToken();
    const startTime = Date.now();
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      this.log("❌", `Ошибка API: ${response.status}`, {
        duration: `${duration}ms`,
        error: error.slice(0, 500),
      });
      throw new Error(`Kling API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    this.log("📥", `Ответ ${response.status} (${duration}ms)`, {
      data: JSON.stringify(data).slice(0, 300),
    });
    return data as T;
  }

  /**
   * Upload video to Kling for reference
   * Returns URL that can be used in generation
   */
  async uploadVideo(videoBuffer: Buffer): Promise<string> {
    this.log("📤", "Загрузка видео для референса...");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }),
      "reference.mp4"
    );

    const token = this.getAuthToken();
    const response = await fetch(`${this.baseUrl}/videos/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload video: ${error}`);
    }

    const data = (await response.json()) as {
      code: number;
      data?: { url: string };
      message?: string;
    };

    if (data.code !== 0 || !data.data?.url) {
      throw new Error(data.message || "Failed to upload video");
    }

    this.log("✅", "Видео загружено", { url: data.data.url.slice(0, 80) });
    return data.data.url;
  }

  /**
   * Generate video using video-to-video (OmniVideo)
   * @param sourceVideoUrl URL of the reference video
   * @param prompt Prompt describing changes (uses @Video1, @Image1, @Element1 syntax)
   * @param options Generation options including image references
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex API workflow requires multiple conditional paths
  async generateVideoToVideo(
    sourceVideoUrl: string,
    prompt: string,
    options: KlingGenerationOptions = {}
  ): Promise<KlingGenerationResult> {
    const startTime = Date.now();

    const logHandle = await aiLogger.startTimer({
      provider: "kling",
      operation: "generateVideoToVideo",
      model: "kling-video",
      generationId: options.generationId,
      reelId: options.reelId,
    });

    this.log("🚀", "═══ НАЧАЛО ГЕНЕРАЦИИ KLING ═══");
    this.log("📝", "Промпт", {
      length: prompt.length,
      text: prompt.slice(0, 150),
    });
    this.log("🎬", "Референс видео (полный URL)", { url: sourceVideoUrl });
    console.log("[Kling] Full source video URL:", sourceVideoUrl);

    // Log image references if present
    if (options.imageUrls?.length) {
      this.log("🖼️", "Image references", { count: options.imageUrls.length });
    }
    if (options.elements?.length) {
      this.log("👤", "Element references", { count: options.elements.length });
    }

    try {
      // Convert @Video1 syntax to <<<video_1>>> per Kling API spec
      let fullPrompt = prompt
        .replace(/@Video1/gi, "<<<video_1>>>")
        .replace(/@Image(\d+)/gi, (_, n) => `<<<image_${n}>>>`)
        .replace(/@Element(\d+)/gi, (_, n) => `<<<element_${n}>>>`);

      // Ensure prompt references the video if not already
      if (!fullPrompt.includes("<<<video_1>>>")) {
        fullPrompt = `Based on <<<video_1>>>, ${fullPrompt}`;
      }

      // Build request body per official Kling OmniVideo API spec
      // All fields at root level, no nested input/config objects
      const requestBody: {
        model_name: string;
        prompt: string;
        video_list: {
          video_url: string;
          refer_type: string;
          keep_original_sound: string;
        }[];
        image_list?: { image_url: string }[];
        mode: string;
        aspect_ratio?: string;
        duration?: string;
      } = {
        model_name: "kling-video-o1",
        prompt: fullPrompt,
        video_list: [
          {
            video_url: sourceVideoUrl,
            // refer_type: "base" = video editing (aspect_ratio not needed)
            // refer_type: "feature" = video reference (aspect_ratio needed)
            refer_type: "base",
            keep_original_sound: options.keepAudio ? "yes" : "no",
          },
        ],
        mode: options.mode || "pro",
      };

      // Add image references (<<<image_1>>>, <<<image_2>>>...)
      if (options.imageUrls && options.imageUrls.length > 0) {
        requestBody.image_list = options.imageUrls.map((url) => ({
          image_url: url,
        }));
      }

      // Note: aspect_ratio is NOT needed for video editing (refer_type: "base")
      // The output uses the same aspect ratio as the input video

      this.log("📤", "Отправка запроса на генерацию...", {
        promptLength: fullPrompt.length,
        promptPreview: fullPrompt.slice(0, 100),
        referType: "base",
        mode: requestBody.mode,
        keepOriginalSound: options.keepAudio ? "yes" : "no",
        hasImages: !!requestBody.image_list?.length,
      });

      const createResponse = await this.request<KlingTaskCreateResponse>(
        "/videos/omni-video",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      );

      if (createResponse.code !== 0 || !createResponse.data?.task_id) {
        return {
          success: false,
          error: createResponse.message || "Failed to create generation task",
        };
      }

      const taskId = createResponse.data.task_id;
      this.log("✨", "Задача создана", { taskId });

      // Poll for completion with optional progress callback
      const result = await this.pollForCompletion(taskId, options.onProgress);

      const totalTime = formatDuration((Date.now() - startTime) / 1000);
      if (result.success) {
        this.log("🎉", `═══ ГЕНЕРАЦИЯ ЗАВЕРШЕНА (${totalTime}) ═══`, {
          videoUrl: result.videoUrl?.slice(0, 80),
        });
        await logHandle.success({
          inputMeta: {
            promptLength: prompt.length,
            mode: options.mode || "pro",
            referType: "base",
            hasImageRefs: !!options.imageUrls?.length,
          },
          outputMeta: { taskId },
        });
      } else {
        this.log("❌", `═══ ГЕНЕРАЦИЯ ПРОВАЛИЛАСЬ (${totalTime}) ═══`, {
          error: result.error,
        });
        await logHandle.fail(new Error(result.error || "Generation failed"), {
          inputMeta: {
            promptLength: prompt.length,
            mode: options.mode || "pro",
            referType: "base",
          },
        });
      }

      return { ...result, taskId };
    } catch (error) {
      const totalTime = formatDuration((Date.now() - startTime) / 1000);
      this.log("💥", `═══ КРИТИЧЕСКАЯ ОШИБКА (${totalTime}) ═══`);
      const err = error instanceof Error ? error : new Error(String(error));
      await logHandle.fail(err);
      return this.parseError(err);
    }
  }

  /**
   * Poll for task completion
   * @param taskId Task ID to poll
   * @param onProgress Optional callback for progress updates
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex polling logic with multiple status transitions
  async pollForCompletion(
    taskId: string,
    onProgress?: KlingProgressCallback
  ): Promise<KlingGenerationResult> {
    let attempts = 0;
    const maxAttempts = 120; // 20 minutes max (10 sec intervals)
    const pollInterval = 10_000; // 10 seconds
    const startTime = Date.now();
    let lastStatus = "";

    this.log("🔄", "Начало ожидания генерации", {
      taskId,
      maxWait: `${(maxAttempts * pollInterval) / 60_000} мин`,
      interval: `${pollInterval / 1000}с`,
    });

    // Initial progress callback
    await onProgress?.(
      "pending",
      undefined,
      "Задача создана, ожидание начала генерации..."
    );

    while (attempts < maxAttempts) {
      await this.sleep(pollInterval);
      attempts += 1;

      const elapsed = (Date.now() - startTime) / 1000;

      try {
        const statusResponse = await this.request<KlingTaskStatusResponse>(
          `/videos/omni-video/${taskId}`
        );

        if (statusResponse.code !== 0 || !statusResponse.data) {
          this.log("⚠️", `Ошибка статуса (попытка ${attempts})`, {
            message: statusResponse.message,
          });
          continue;
        }

        // Normalize API status to internal status
        const apiStatus = statusResponse.data.task_status;
        const status = normalizeStatus(apiStatus);
        const emoji = STATUS_EMOJI[status] ?? "❓";
        const statusRu = STATUS_RU[status] ?? status;

        // Log only on status change or every 5 attempts
        if (status !== lastStatus || attempts % 5 === 0) {
          this.log(emoji, `${statusRu}`, {
            taskId: taskId.slice(0, 20),
            attempt: `${attempts}/${maxAttempts}`,
            elapsed: formatDuration(elapsed),
            apiStatus,
          });
          lastStatus = status;
        }

        // Call progress callback
        const elapsedFormatted = formatDuration(elapsed);
        const progressMessage = `${statusRu} (${elapsedFormatted})`;
        await onProgress?.(status, undefined, progressMessage);

        if (status === "completed") {
          const videoUrl = statusResponse.data.task_result?.videos?.[0]?.url;
          if (videoUrl) {
            this.log("✅", `Генерация завершена за ${formatDuration(elapsed)}`);
            await onProgress?.(
              "completed",
              100,
              `Генерация завершена за ${elapsedFormatted}`
            );
            return { success: true, videoUrl, taskId };
          }
          return { success: false, error: "No video URL in response", taskId };
        }

        if (status === "failed") {
          const errorMsg =
            statusResponse.data.task_status_msg ?? "Generation failed";
          this.log("❌", "Генерация провалилась", { error: errorMsg });
          await onProgress?.("failed", undefined, `Ошибка: ${errorMsg}`);
          return { success: false, error: errorMsg, taskId };
        }
      } catch (pollError) {
        const err =
          pollError instanceof Error ? pollError : new Error(String(pollError));
        this.log("⚠️", `Ошибка при проверке статуса (попытка ${attempts})`, {
          error: err.message,
        });
        // Continue polling despite errors
      }
    }

    const totalTime = formatDuration((Date.now() - startTime) / 1000);
    this.log("⏰", "Таймаут ожидания генерации", {
      taskId,
      attempts: maxAttempts,
      totalTime,
    });
    await onProgress?.(
      "failed",
      undefined,
      `Таймаут генерации после ${totalTime}`
    );
    return {
      success: false,
      error: `Generation timeout after ${totalTime}`,
      taskId,
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<{
    status: KlingTaskStatus;
    videoUrl?: string;
  }> {
    const response = await this.request<KlingTaskStatusResponse>(
      `/videos/omni-video/${taskId}`
    );

    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || "Failed to get task status");
    }

    return {
      status: normalizeStatus(response.data.task_status),
      videoUrl: response.data.task_result?.videos?.[0]?.url,
    };
  }

  /**
   * Download generated video
   */
  async downloadVideo(videoUrl: string): Promise<Buffer> {
    this.log("📥", "Скачивание видео...");

    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    this.log(
      "✅",
      `Видео скачано: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
    );
    return buffer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseError(error: Error): KlingGenerationResult {
    const msg = error.message;

    this.log("❌", "Ошибка Kling", {
      message: msg,
      stack: error.stack?.slice(0, 200),
    });

    if (msg.includes("401") || msg.includes("unauthorized")) {
      return {
        success: false,
        error: "Неверный API ключ Kling. Проверьте KLING_API_KEY.",
      };
    }
    if (msg.includes("429") || msg.includes("rate_limit")) {
      return {
        success: false,
        error: "Превышен лимит запросов Kling. Попробуйте позже.",
      };
    }
    if (msg.includes("insufficient") || msg.includes("quota")) {
      return {
        success: false,
        error: "Недостаточно квоты Kling для генерации видео.",
      };
    }

    return { success: false, error: msg };
  }
}

let klingServiceInstance: KlingService | null = null;

export function getKlingService(): KlingService {
  // Always create new instance to pick up code changes in dev
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!(accessKey && secretKey)) {
    throw new Error(
      "KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables are required"
    );
  }
  klingServiceInstance = new KlingService(accessKey, secretKey);
  return klingServiceInstance;
}

/**
 * Check if Kling API is configured
 */
export function isKlingConfigured(): boolean {
  return !!(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
}
