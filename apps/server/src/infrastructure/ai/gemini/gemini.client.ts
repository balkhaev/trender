import { unlink, writeFile } from "node:fs/promises";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import { timeouts } from "../../../config";
import { aiLogger } from "../../../services/ai-logger";
import { withTimeout } from "../../../services/utils";
import {
  extractTextFromResponse,
  JSON_REGEX,
  parseDuration,
  parseRawAnalysis,
  parseRawAnalysisWithoutOptions,
} from "./gemini.parsers";
import {
  ANALYSIS_PROMPT,
  ELEMENTS_ONLY_PROMPT,
  FRAMES_ANALYSIS_PROMPT,
  FRAMES_ELEMENTS_ONLY_PROMPT,
  UNIFIED_ANALYSIS_PROMPT,
} from "./gemini.prompts";
import type {
  ElementWithAppearances,
  GeminiProgressCallback,
  SceneBoundary,
  UnifiedVideoAnalysis,
  VideoAnalysis,
  VideoAnalysisWithoutOptions,
} from "./gemini.types";

// Safety settings - reduce sensitivity for video content analysis
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRawAnalysis = any;

// Parameters for universal analysis
type AnalyzeContentParams<T> = {
  operation: string;
  model: "gemini-2.0-flash" | "gemini-2.5-flash";
  contentParts: Array<
    | { fileData: { mimeType: string; fileUri: string } }
    | { inlineData: { mimeType: string; data: string } }
    | { text: string }
  >;
  prompt: string;
  parseResult: (raw: AnyRawAnalysis) => T;
  onProgress?: GeminiProgressCallback;
  reelId?: string;
  progressMessages?: {
    start: string;
    processing: string;
    done: string;
  };
  inputMeta?: Record<string, unknown>;
};

export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  /**
   * Universal method for content analysis via Gemini
   * Handles logging, progress, generation and response parsing
   */
  private async analyzeContent<T>(params: AnalyzeContentParams<T>): Promise<T> {
    const {
      operation,
      model,
      contentParts,
      prompt,
      parseResult,
      onProgress,
      reelId,
      progressMessages = {
        start: "Запуск AI-анализа...",
        processing: "Обработка результатов...",
        done: "Анализ завершён",
      },
      inputMeta,
    } = params;

    const logHandle = await aiLogger.startTimer({
      provider: "gemini",
      operation,
      model,
      reelId,
    });

    try {
      await onProgress?.("analyzing", 55, progressMessages.start);

      const geminiModel = this.genAI.getGenerativeModel({
        model,
        safetySettings: SAFETY_SETTINGS,
      });

      const result = await withTimeout(
        geminiModel.generateContent([...contentParts, { text: prompt }]),
        timeouts.geminiApi,
        `Gemini ${operation}`
      );

      await onProgress?.("analyzing", 80, progressMessages.processing);

      const response = result.response;
      const text = extractTextFromResponse(response);

      const jsonMatch = text.match(JSON_REGEX);
      if (!jsonMatch) {
        throw new Error(`Failed to parse ${operation} response`);
      }

      const raw = JSON.parse(jsonMatch[0]) as AnyRawAnalysis;
      const parsed = parseResult(raw);

      await onProgress?.("analyzing", 90, progressMessages.done);

      // Form outputMeta depending on result type
      const outputMeta: Record<string, unknown> = {};
      if ("elements" in (parsed as object)) {
        outputMeta.elementsCount = (
          parsed as { elements: unknown[] }
        ).elements.length;
      }
      if ("tags" in (parsed as object)) {
        outputMeta.tags = (parsed as { tags: string[] }).tags;
      }

      await logHandle.success({
        // biome-ignore lint/suspicious/noExplicitAny: JsonValue type casting
        inputMeta: inputMeta as any,
        // biome-ignore lint/suspicious/noExplicitAny: JsonValue type casting
        outputMeta: outputMeta as any,
      });

      return parsed;
    } catch (error) {
      await logHandle.fail(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  async uploadVideo(
    videoBuffer: Buffer,
    mimeType: string,
    displayName: string,
    onProgress?: GeminiProgressCallback
  ): Promise<string> {
    console.log(
      `[GEMINI] uploadVideo: writing temp file for ${displayName}...`
    );
    const tempPath = `/tmp/${Date.now()}-${displayName}`;
    await writeFile(tempPath, videoBuffer);
    console.log(`[GEMINI] uploadVideo: temp file written to ${tempPath}`);

    await onProgress?.("uploading", 5, "Загрузка видео в Gemini...");

    try {
      console.log("[GEMINI] uploadVideo: calling fileManager.uploadFile...");
      const uploadResult = await this.fileManager.uploadFile(tempPath, {
        mimeType,
        displayName,
      });
      console.log(
        `[GEMINI] uploadVideo: upload done, state: ${uploadResult.file.state}`
      );

      let file = uploadResult.file;
      let pollCount = 0;
      const startTime = Date.now();

      await onProgress?.(
        "uploading",
        10,
        "Файл загружен, ожидание обработки..."
      );

      while (file.state === FileState.PROCESSING) {
        // Check file processing timeout
        if (Date.now() - startTime > timeouts.geminiProcessing) {
          throw new Error(
            `Gemini processing timeout: файл обрабатывается дольше ${timeouts.geminiProcessing / 1000 / 60} минут`
          );
        }

        pollCount += 1;
        // Progress from 10% to 50% during file processing
        const percent = Math.min(10 + pollCount * 3, 50);
        await onProgress?.(
          "processing",
          percent,
          `Обработка файла Gemini (${pollCount * 2}с)...`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        file = await this.fileManager.getFile(file.name);
      }

      if (file.state === FileState.FAILED) {
        throw new Error("Video processing failed");
      }

      await onProgress?.("processing", 50, "Файл готов к анализу");

      return file.uri;
    } finally {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async analyzeVideo(
    fileUri: string,
    onProgress?: GeminiProgressCallback,
    reelId?: string
  ): Promise<VideoAnalysis> {
    return this.analyzeContent<VideoAnalysis>({
      operation: "analyzeVideo",
      model: "gemini-2.0-flash",
      contentParts: [{ fileData: { mimeType: "video/mp4", fileUri } }],
      prompt: ANALYSIS_PROMPT,
      parseResult: parseRawAnalysis,
      onProgress,
      reelId,
      progressMessages: {
        start: "Запуск AI-анализа видео...",
        processing: "Обработка результатов анализа...",
        done: "Анализ завершён",
      },
    });
  }

  async processVideo(
    videoBuffer: Buffer,
    mimeType: string,
    fileName: string,
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysis> {
    const fileUri = await this.uploadVideo(
      videoBuffer,
      mimeType,
      fileName,
      onProgress
    );
    const analysis = await this.analyzeVideo(fileUri, onProgress);
    return analysis;
  }

  /**
   * Analyze video by analyzing a sequence of extracted frames
   */
  async analyzeFrames(
    frames: string[],
    onProgress?: GeminiProgressCallback,
    reelId?: string
  ): Promise<VideoAnalysis> {
    if (frames.length === 0) {
      throw new Error("No frames provided for analysis");
    }

    const imageParts = frames.map((base64) => ({
      inlineData: { mimeType: "image/jpeg", data: base64 },
    }));

    return this.analyzeContent<VideoAnalysis>({
      operation: "analyzeFrames",
      model: "gemini-2.5-flash",
      contentParts: imageParts,
      prompt: FRAMES_ANALYSIS_PROMPT,
      parseResult: parseRawAnalysis,
      onProgress,
      reelId,
      progressMessages: {
        start: `Анализ ${frames.length} кадров через Gemini AI...`,
        processing: "Обработка результатов анализа...",
        done: "Анализ кадров завершён",
      },
      inputMeta: { framesCount: frames.length },
    });
  }

  /**
   * Process video by extracting frames and analyzing them
   */
  async processVideoByFrames(
    videoBuffer: Buffer,
    framesServiceUrl: string,
    intervalSec = 2.0,
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysis> {
    await onProgress?.("processing", 10, "Извлечение кадров из видео...");

    // Call video-frames service to extract frames
    const formData = new FormData();
    formData.append(
      "video",
      new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }),
      "video.mp4"
    );
    formData.append("interval_sec", intervalSec.toString());

    const response = await fetch(`${framesServiceUrl}/extract-frames`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to extract frames: ${error}`);
    }

    const data = (await response.json()) as {
      success: boolean;
      frames: string[];
      count: number;
      error?: string;
    };

    if (!data.success || data.frames.length === 0) {
      throw new Error(data.error || "No frames extracted from video");
    }

    await onProgress?.(
      "processing",
      40,
      `Извлечено ${data.count} кадров, начинаем анализ...`
    );

    // Analyze extracted frames
    return this.analyzeFrames(data.frames, onProgress);
  }

  // ============================================
  // UNIFIED ANALYSIS (elements with scene binding)
  // ============================================

  /**
   * Analyzes video with scene boundaries
   * Returns flat list of unique elements with appearances (which scenes they appear in)
   */
  async analyzeVideoUnified(
    fileUri: string,
    sceneBoundaries: SceneBoundary[],
    onProgress?: GeminiProgressCallback,
    reelId?: string
  ): Promise<UnifiedVideoAnalysis> {
    const logHandle = await aiLogger.startTimer({
      provider: "gemini",
      operation: "analyzeVideoUnified",
      model: "gemini-2.0-flash",
      reelId,
    });

    try {
      await onProgress?.("analyzing", 55, "Запуск unified AI-анализа видео...");

      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        safetySettings: SAFETY_SETTINGS,
      });

      // Form scene boundaries string for prompt
      const sceneBoundariesStr = sceneBoundaries
        .map(
          (s) =>
            `Scene ${s.index}: ${s.startTime.toFixed(2)}s - ${s.endTime.toFixed(2)}s`
        )
        .join("\n");

      const prompt = UNIFIED_ANALYSIS_PROMPT.replace(
        "{sceneBoundaries}",
        sceneBoundariesStr
      );

      const result = await withTimeout(
        model.generateContent([
          {
            fileData: {
              mimeType: "video/mp4",
              fileUri,
            },
          },
          { text: prompt },
        ]),
        timeouts.geminiApi,
        "Gemini analyzeVideoUnified"
      );

      await onProgress?.("analyzing", 80, "Обработка результатов анализа...");

      const response = result.response;
      const text = extractTextFromResponse(response);

      const jsonMatch = text.match(JSON_REGEX);
      if (!jsonMatch) {
        throw new Error("Failed to parse unified analysis response");
      }

      const raw = JSON.parse(jsonMatch[0]) as {
        duration?: number | string | null;
        aspectRatio?: string;
        tags?: string[];
        elements?: ElementWithAppearances[];
      };

      const duration = parseDuration(raw.duration);

      // Limit to 6 elements
      let elements = raw.elements || [];
      if (elements.length > 6) {
        elements = elements.slice(0, 6);
      }

      await onProgress?.("analyzing", 90, "Unified анализ завершён");

      const analysisResult: UnifiedVideoAnalysis = {
        duration,
        aspectRatio: raw.aspectRatio || "9:16",
        tags: raw.tags || [],
        elements,
      };

      await logHandle.success({
        inputMeta: { scenesCount: sceneBoundaries.length },
        outputMeta: {
          elementsCount: analysisResult.elements.length,
          tags: analysisResult.tags,
        },
      });

      return analysisResult;
    } catch (error) {
      await logHandle.fail(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // ============================================
  // METHODS FOR ENCHANTING MODE (without options)
  // ============================================

  /**
   * Analyzes video and returns only elements WITHOUT remix options
   * Used for enchanting mode where options are generated by ChatGPT
   */
  async analyzeVideoElementsOnly(
    fileUri: string,
    onProgress?: GeminiProgressCallback,
    reelId?: string
  ): Promise<VideoAnalysisWithoutOptions> {
    return this.analyzeContent<VideoAnalysisWithoutOptions>({
      operation: "analyzeVideoElementsOnly",
      model: "gemini-2.0-flash",
      contentParts: [{ fileData: { mimeType: "video/mp4", fileUri } }],
      prompt: ELEMENTS_ONLY_PROMPT,
      parseResult: parseRawAnalysisWithoutOptions,
      onProgress,
      reelId,
      progressMessages: {
        start: "Запуск AI-анализа видео (enchanting)...",
        processing: "Обработка результатов анализа...",
        done: "Анализ элементов завершён",
      },
    });
  }

  /**
   * Processes video and returns only elements WITHOUT options
   */
  async processVideoElementsOnly(
    videoBuffer: Buffer,
    mimeType: string,
    fileName: string,
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysisWithoutOptions> {
    const fileUri = await this.uploadVideo(
      videoBuffer,
      mimeType,
      fileName,
      onProgress
    );
    return this.analyzeVideoElementsOnly(fileUri, onProgress);
  }

  /**
   * Analyzes frames and returns only elements WITHOUT remix options
   */
  async analyzeFramesElementsOnly(
    frames: string[],
    onProgress?: GeminiProgressCallback,
    reelId?: string
  ): Promise<VideoAnalysisWithoutOptions> {
    if (frames.length === 0) {
      throw new Error("No frames provided for analysis");
    }

    const imageParts = frames.map((base64) => ({
      inlineData: { mimeType: "image/jpeg", data: base64 },
    }));

    return this.analyzeContent<VideoAnalysisWithoutOptions>({
      operation: "analyzeFramesElementsOnly",
      model: "gemini-2.5-flash",
      contentParts: imageParts,
      prompt: FRAMES_ELEMENTS_ONLY_PROMPT,
      parseResult: parseRawAnalysisWithoutOptions,
      onProgress,
      reelId,
      progressMessages: {
        start: `Анализ ${frames.length} кадров (enchanting)...`,
        processing: "Обработка результатов анализа...",
        done: "Анализ кадров завершён",
      },
      inputMeta: { framesCount: frames.length },
    });
  }

  /**
   * Processes video by frames and returns only elements WITHOUT options
   */
  async processVideoByFramesElementsOnly(
    videoBuffer: Buffer,
    framesServiceUrl: string,
    intervalSec = 2.0,
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysisWithoutOptions> {
    await onProgress?.("processing", 10, "Извлечение кадров из видео...");

    const formData = new FormData();
    formData.append(
      "video",
      new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }),
      "video.mp4"
    );
    formData.append("interval_sec", intervalSec.toString());

    const response = await fetch(`${framesServiceUrl}/extract-frames`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to extract frames: ${error}`);
    }

    const data = (await response.json()) as {
      success: boolean;
      frames: string[];
      count: number;
      error?: string;
    };

    if (!data.success || data.frames.length === 0) {
      throw new Error(data.error || "No frames extracted from video");
    }

    await onProgress?.(
      "processing",
      40,
      `Извлечено ${data.count} кадров, начинаем анализ...`
    );

    return this.analyzeFramesElementsOnly(data.frames, onProgress);
  }
}
