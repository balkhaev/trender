/**
 * Kling AI OmniVideo Service
 * Video-to-video generation with reference video input
 *
 * API Documentation: https://app.klingai.com/global/dev/document-api/apiReference/model/OmniVideo
 * Default API URL: https://api-singapore.klingai.com/
 */

import jwt from "jsonwebtoken";
import { ai, server } from "../config";
import { aiLogger } from "./ai-logger";

// Config aliases
const klingConfig = ai.kling;
const logLevel = server.logLevel;

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
    let url = baseUrl || klingConfig.apiUrl;
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
    }
    return this.jwtToken;
  }

  private log(
    level: "info" | "debug" | "error",
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
    // Debug логи только если LOG_LEVEL=debug
    if (level === "debug" && logLevel !== "debug") {
      return;
    }

    const timestamp = new Date().toISOString().slice(11, 19);
    const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
    const logFn = level === "error" ? console.error : console.log;
    logFn(`[${timestamp}] [Kling] ${message}${dataStr}`);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 3
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const retryableStatuses = [502, 503, 504, 429];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const token = this.getAuthToken();
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        if (!response.ok) {
          const error = await response.text();

          // Retry on temporary errors
          if (
            retryableStatuses.includes(response.status) &&
            attempt < retries
          ) {
            const delay = Math.min(1000 * 2 ** attempt, 30_000); // exponential backoff, max 30s
            this.log(
              "info",
              `Ошибка ${response.status}, повтор через ${delay / 1000}с (${attempt}/${retries})`
            );
            await this.sleep(delay);
            continue;
          }

          this.log("error", `Ошибка API: ${response.status}`, {
            error: error.slice(0, 200),
          });
          throw new Error(`Kling API error ${response.status}: ${error}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Retry on network errors
        const isNetworkError =
          lastError.message.includes("fetch failed") ||
          lastError.message.includes("ECONNRESET") ||
          lastError.message.includes("ETIMEDOUT");

        if (isNetworkError && attempt < retries) {
          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          this.log(
            "info",
            `Сетевая ошибка, повтор через ${delay / 1000}с (${attempt}/${retries})`
          );
          await this.sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Upload video to Kling for reference
   * Returns URL that can be used in generation
   */
  async uploadVideo(videoBuffer: Buffer): Promise<string> {
    this.log("debug", "Загрузка видео для референса...");

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

    this.log("debug", "Видео загружено");
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

    this.log(
      "info",
      `Генерация: ${options.duration || 5}с, mode=${options.mode || "pro"}`,
      {
        prompt: prompt.slice(0, 80),
      }
    );

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
        negative_prompt?: string;
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

      // Add negative prompt to protect unselected objects
      if (options.negativePrompt) {
        requestBody.negative_prompt = options.negativePrompt;
      }

      // Add image references (<<<image_1>>>, <<<image_2>>>...)
      if (options.imageUrls && options.imageUrls.length > 0) {
        requestBody.image_list = options.imageUrls.map((url) => ({
          image_url: url,
        }));
      }

      // Note: aspect_ratio is NOT needed for video editing (refer_type: "base")
      // The output uses the same aspect ratio as the input video

      this.log("debug", "Отправка запроса...");

      const createResponse = await this.request<KlingTaskCreateResponse>(
        "/videos/omni-video",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      );

      if (createResponse.code !== 0 || !createResponse.data?.task_id) {
        const errorMsg =
          createResponse.message || "Failed to create generation task";
        await logHandle.fail(new Error(errorMsg), {
          inputMeta: {
            promptLength: prompt.length,
            mode: options.mode || "pro",
            referType: "base",
            imageUrls: options.imageUrls ?? [],
            sourceVideoUrl,
            fullPrompt,
            requestBody,
          },
          outputMeta: {
            responseCode: createResponse.code,
            responseMessage: createResponse.message,
          },
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      const taskId = createResponse.data.task_id;
      this.log("info", "Задача создана");

      // Poll for completion with optional progress callback
      const result = await this.pollForCompletion(taskId, options.onProgress);

      const totalTime = formatDuration((Date.now() - startTime) / 1000);
      if (result.success) {
        this.log("info", `Готово (${totalTime})`);
        await logHandle.success({
          inputMeta: {
            promptLength: prompt.length,
            mode: options.mode || "pro",
            referType: "base",
            hasImageRefs: !!options.imageUrls?.length,
            imageUrls: options.imageUrls ?? [],
            sourceVideoUrl,
            fullPrompt,
            requestBody,
          },
          outputMeta: {
            taskId,
            responseCode: createResponse.code,
            responseMessage: createResponse.message,
            videoUrl: result.videoUrl ?? null,
          },
        });
      } else {
        this.log("error", `Ошибка (${totalTime}): ${result.error}`);
        await logHandle.fail(new Error(result.error || "Generation failed"), {
          inputMeta: {
            promptLength: prompt.length,
            mode: options.mode || "pro",
            referType: "base",
            imageUrls: options.imageUrls ?? [],
            sourceVideoUrl,
            fullPrompt,
            requestBody,
          },
          outputMeta: {
            taskId,
            error: result.error ?? null,
          },
        });
      }

      return { ...result, taskId };
    } catch (error) {
      const totalTime = formatDuration((Date.now() - startTime) / 1000);
      this.log("error", `Критическая ошибка (${totalTime})`);
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
          continue;
        }

        // Normalize API status to internal status
        const apiStatus = statusResponse.data.task_status;
        const status = normalizeStatus(apiStatus);
        const statusRu = STATUS_RU[status] ?? status;

        // Log only on status change
        if (status !== lastStatus) {
          this.log("info", `${statusRu} (${formatDuration(elapsed)})`);
          lastStatus = status;
        }

        // Call progress callback
        const elapsedFormatted = formatDuration(elapsed);
        const progressMessage = `${statusRu} (${elapsedFormatted})`;
        await onProgress?.(status, undefined, progressMessage);

        if (status === "completed") {
          const videoUrl = statusResponse.data.task_result?.videos?.[0]?.url;
          if (videoUrl) {
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
          this.log("error", `Ошибка: ${errorMsg}`);
          await onProgress?.("failed", undefined, `Ошибка: ${errorMsg}`);
          return { success: false, error: errorMsg, taskId };
        }
      } catch (pollError) {
        // Логируем ошибку, но продолжаем polling (может быть временный сбой сети)
        const errorMsg =
          pollError instanceof Error ? pollError.message : String(pollError);
        this.log(
          "debug",
          `Ошибка при polling (попытка ${attempts}): ${errorMsg}`
        );

        // Если ошибка повторяется много раз подряд - прерываем
        if (attempts > 10 && errorMsg.includes("401")) {
          this.log("error", "Прерывание polling: ошибка авторизации");
          await onProgress?.(
            "failed",
            undefined,
            "Ошибка авторизации Kling API"
          );
          return { success: false, error: "Authorization error", taskId };
        }
      }
    }

    const totalTime = formatDuration((Date.now() - startTime) / 1000);
    this.log("error", `Таймаут (${totalTime})`);
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
    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    this.log("info", `Скачано ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
    return buffer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseError(error: Error): KlingGenerationResult {
    const msg = error.message;
    const accessKeyPreview = this.accessKey
      ? `${this.accessKey.slice(0, 8)}...${this.accessKey.slice(-4)}`
      : "not set";

    if (msg.includes("401") || msg.includes("unauthorized")) {
      return {
        success: false,
        error: `Неверный API ключ Kling (${accessKeyPreview}). Проверьте KLING_ACCESS_KEY.`,
      };
    }

    // Account balance error (code 1102)
    if (msg.includes("balance not enough") || msg.includes("1102")) {
      return {
        success: false,
        error: `Недостаточно средств на аккаунте Kling (${accessKeyPreview}). Пополните баланс на https://app.klingai.com`,
      };
    }

    if (msg.includes("429") || msg.includes("rate_limit")) {
      return {
        success: false,
        error: `Превышен лимит запросов Kling (${accessKeyPreview}). Попробуйте позже.`,
      };
    }

    // Gateway errors (502, 503, 504)
    if (msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return {
        success: false,
        error: `Сервер Kling временно недоступен. Попробуйте позже. [key: ${accessKeyPreview}]`,
      };
    }

    if (msg.includes("insufficient") || msg.includes("quota")) {
      return {
        success: false,
        error: `Недостаточно квоты Kling (${accessKeyPreview}) для генерации видео.`,
      };
    }

    return { success: false, error: `${msg} [key: ${accessKeyPreview}]` };
  }
}

let klingServiceInstance: KlingService | null = null;

export function getKlingService(): KlingService {
  if (!klingConfig.isConfigured()) {
    throw new Error(
      "KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables are required"
    );
  }

  // Используем синглтон для переиспользования JWT токена и соблюдения rate limits
  if (!klingServiceInstance) {
    klingServiceInstance = new KlingService(
      klingConfig.accessKey,
      klingConfig.secretKey
    );
  }

  return klingServiceInstance;
}

/**
 * Сбросить синглтон (для тестов или при изменении конфигурации)
 */
export function resetKlingService(): void {
  klingServiceInstance = null;
}

/**
 * Check if Kling API is configured
 */
export const isKlingConfigured = klingConfig.isConfigured;

/**
 * Response type for /account/costs endpoint
 */
type KlingAccountCostsResponse = {
  code: number;
  message: string;
  request_id: string;
  data?: {
    code: number;
    msg: string;
    resource_pack_subscribe_infos: {
      resource_pack_name: string;
      resource_pack_id: string;
      resource_pack_type: "decreasing_total" | "constant_period";
      total_quantity: number;
      remaining_quantity: number;
      purchase_time: number;
      effective_time: number;
      invalid_time: number;
      status: "toBeOnline" | "online" | "expired" | "runOut";
    }[];
  };
};

export type KlingBalanceResult = {
  remainingTokens: number;
  error?: string;
};

/**
 * Get account balance (sum of all active resource packs)
 * This is a static method that creates its own auth to call /account/costs
 */
export async function getKlingAccountBalance(): Promise<KlingBalanceResult> {
  if (!klingConfig.isConfigured()) {
    return { remainingTokens: 0, error: "Kling API not configured" };
  }

  try {
    const token = generateJwtToken(
      klingConfig.accessKey,
      klingConfig.secretKey
    );

    // /account/costs is NOT under /v1, use base URL without version
    let baseUrl = klingConfig.apiUrl.replace(TRAILING_SLASH_REGEX, "");
    if (baseUrl.endsWith("/v1")) {
      baseUrl = baseUrl.slice(0, -3);
    }

    // Query params: last year to now
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const url = `${baseUrl}/account/costs?start_time=${oneYearAgo}&end_time=${now}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        remainingTokens: 0,
        error: `API error ${response.status}: ${error}`,
      };
    }

    const data = (await response.json()) as KlingAccountCostsResponse;

    if (data.code !== 0 || !data.data?.resource_pack_subscribe_infos) {
      return {
        remainingTokens: 0,
        error: data.message || "Failed to get balance",
      };
    }

    // Sum remaining_quantity of all active ("online") packs
    const activeTokens = data.data.resource_pack_subscribe_infos
      .filter((pack) => pack.status === "online")
      .reduce((sum, pack) => sum + pack.remaining_quantity, 0);

    return { remainingTokens: Math.floor(activeTokens) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { remainingTokens: 0, error: msg };
  }
}
