import { unlink, writeFile } from "node:fs/promises";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import { ai, timeouts } from "../config";
import { aiLogger } from "./ai-logger";
import { withTimeout } from "./utils";

const geminiConfig = ai.gemini;

// Scene in the video with timestamp
export type VideoScene = {
  timestamp: string; // "0:00-0:03"
  description: string;
  action: string;
};

// Character/person in the video
export type VideoCharacter = {
  id: string; // "person1", "person2"
  age: string; // "mid-20s", "elderly"
  gender: string;
  appearance: string; // physical description
  clothing: string;
  actions: string; // what they do in the video
};

// Object in the video
export type VideoObject = {
  name: string;
  role: string; // "main focus", "background prop", "interactive"
  position: string; // "center frame", "left side"
  description: string;
};

// Camera movement segment
export type CameraMovement = {
  type: string; // "static", "pan", "tilt", "dolly", "crane", "handheld", "drone", "zoom"
  direction: string; // "left", "right", "up", "down", "forward", "backward"
  speed: string; // "slow", "medium", "fast"
  startTime: string;
  endTime: string;
};

// Scene transition
export type VideoTransition = {
  type: string; // "cut", "fade", "dissolve", "wipe"
  timestamp: string;
};

// Audio description
export type VideoAudio = {
  music: string; // genre, mood, tempo
  speech: string; // dialogue, voiceover, none
  effects: string; // sound effects present
  mood: string; // audio atmosphere
};

// Text overlay
export type TextOverlay = {
  text: string;
  timestamp: string;
  position: string; // "top", "center", "bottom"
  style: string; // "bold title", "subtitle", "caption"
};

// Creative remix option for a specific element
export type RemixOption = {
  id: string; // "variant-1"
  label: string; // "Cyberpunk Robot"
  icon: string; // "🤖"
  prompt: string; // "Transform the [subject] into a futuristic cyberpunk robot with neon details"
};

// Detectable element in the video
export type DetectableElement = {
  id: string; // "element-1", "char-1"
  type: "character" | "object" | "background";
  label: string; // "Ginger Cat", "Coffee Cup", "Kitchen"
  description: string; // "A fluffy ginger cat sitting..."
  remixOptions: RemixOption[]; // Specific replacements for THIS element
};

// Video analysis - simplified to focus on elements
export type VideoAnalysis = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: DetectableElement[];
};

// Элемент без вариантов (для enchanting режима)
export type ElementWithoutOptions = Omit<DetectableElement, "remixOptions">;

// Анализ видео без вариантов (для enchanting режима)
export type VideoAnalysisWithoutOptions = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: ElementWithoutOptions[];
};

// Scene appearance for an element
export type ElementAppearance = {
  sceneIndex: number;
  startTime: number;
  endTime: number;
};

// Element with appearances (for unified analysis)
export type ElementWithAppearances = {
  id: string;
  type: "character" | "object" | "background";
  label: string;
  description: string;
  appearances: ElementAppearance[];
};

// Scene boundary from PySceneDetect
export type SceneBoundary = {
  index: number;
  startTime: number;
  endTime: number;
};

// Unified analysis result (elements with appearances)
export type UnifiedVideoAnalysis = {
  duration: number | null;
  aspectRatio: string;
  tags: string[];
  elements: ElementWithAppearances[];
};

const ANALYSIS_PROMPT = `Identify key visual elements in this video for AI remix.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress, holding coffee cup",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing on wooden floor, leaning against kitchen counter",
      "visibilityPercent": 100,
      "contactPoints": "feet on floor, elbow on counter",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Cyberpunk android with glowing blue circuitry on metallic silver skin, neon LED eyes, chrome joints"},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Ethereal elf with pointed ears, silver hair, golden eyes, elvish robes"},
        {"id": "opt-3", "label": "Anime Girl", "icon": "🎌", "prompt": "Anime style with large eyes, pink hair, cute expressions"}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug, matte gray, steam rising",
      "position": "center-right, held in hands",
      "environmentInteractions": "held by woman's hands, tilted at 15 degrees",
      "visibilityPercent": 90,
      "contactPoints": "fingers wrapped around cup body",
      "occlusionInfo": "partially hidden by fingers",
      "remixOptions": [
        {"id": "opt-1", "label": "Magic Potion", "icon": "🧪", "prompt": "Bubbling potion in crystal vial with purple mist and glowing runes"},
        {"id": "opt-2", "label": "Alien Device", "icon": "👽", "prompt": "Alien tech with holographic display and floating energy orbs"},
        {"id": "opt-3", "label": "Golden Chalice", "icon": "🏆", "prompt": "Ornate golden chalice with rubies and emeralds"}
      ]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "environmentInteractions": "surrounding the scene, provides context",
      "visibilityPercent": 100,
      "remixOptions": [
        {"id": "opt-1", "label": "Spaceship", "icon": "🚀", "prompt": "Futuristic spaceship command center with holographic displays and stars through windows"},
        {"id": "opt-2", "label": "Medieval Castle", "icon": "🏰", "prompt": "Castle great hall with stone walls, torches, tapestries"},
        {"id": "opt-3", "label": "Underwater Palace", "icon": "🐠", "prompt": "Underwater palace with coral walls, bioluminescent lighting, fish"}
      ]
    }
  ]
}

RULES:

1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. If more detected, keep only the 6 most visually significant. RANK by visual importance.

2. **tags**: 3-5 short tags describing video theme/style/mood (lowercase, english)

3. **elements**: Identify the most significant elements, ranked by visual importance:
   - Characters: "char-1", "char-2" (people, animals)
   - Objects: "obj-1", "obj-2" (important items)
   - Backgrounds: "bg-1" (environments)

4. **remixOptions**: EXACTLY 4 per element. NOT 3, NOT 5, NOT 6. EXACTLY 4. RANKED by visual impact:
   - First options = most dramatic/viral transformations
   - Last options = subtle but interesting changes
   - Diverse styles: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi, Horror

5. **label**: 2-3 words | **icon**: single emoji | **prompt**: specific visual details

6. **position**: Where in frame the element appears (e.g., "center foreground", "left side", "background right"). REQUIRED for precise AI targeting.

7. **environmentInteractions** (CRITICAL): HOW the object physically interacts with its environment:
   - "50% inserted into pipe from right side" / "resting on table" / "embedded in wall"
   - "held by person" / "attached to surface" / "floating in air"
   - Be VERY specific about insertion depth, contact angles, embedding percentage

8. **visibilityPercent**: 0-100, how much of the object is visible (not hidden by other objects):
   - 100 = fully visible
   - 50 = half hidden/embedded
   - 0 = completely hidden

9. **contactPoints**: WHERE the object physically touches surfaces or other objects:
   - "wheels on road" / "feet on ground" / "back against wall"
   - "front half inside pipe" / "hands holding cup"

10. **occlusionInfo**: What hides this object and what it hides (if any):
    - "front half hidden by pipe" / "Santa sitting on top" / "partially behind tree"`;

// Промпт для анализа БЕЗ генерации вариантов (для enchanting режима)
const ELEMENTS_ONLY_PROMPT = `Identify key visual elements in this video for AI remix. NO remixOptions.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress, holding coffee cup",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing on wooden floor, leaning against counter",
      "visibilityPercent": 100,
      "contactPoints": "feet on floor, elbow on counter"
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug, matte gray, steam rising",
      "position": "center-right, held in hands",
      "environmentInteractions": "held by woman's hands, tilted slightly",
      "visibilityPercent": 90,
      "contactPoints": "fingers around cup body",
      "occlusionInfo": "partially hidden by fingers"
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "visibilityPercent": 100
    }
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance.
2. **tags**: 3-5 short tags describing video theme/style/mood (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **NO remixOptions** - they will be generated separately
5. **description**: Specific visual details (materials, colors, clothing)
6. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
7. **environmentInteractions** (CRITICAL): HOW object interacts with environment - "50% in pipe", "resting on table", "held by person"
8. **visibilityPercent**: 0-100, how much visible (50 = half hidden)
9. **contactPoints**: WHERE object touches surfaces - "wheels on road", "front inside pipe"
10. **occlusionInfo**: What hides this object - "front half hidden by pipe"`;

const FRAMES_ELEMENTS_ONLY_PROMPT = `Identify key visual elements in these video frames. NO remixOptions.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {"id": "char-1", "type": "character", "label": "Main Subject", "description": "Detailed description", "position": "center foreground", "environmentInteractions": "standing on wooden floor", "visibilityPercent": 100, "contactPoints": "feet on floor"},
    {"id": "obj-1", "type": "object", "label": "Key Object", "description": "Most prominent object", "position": "center-right", "environmentInteractions": "50% inserted into pipe from right", "visibilityPercent": 50, "contactPoints": "rear wheels on ground, front inside pipe", "occlusionInfo": "front half hidden by pipe"},
    {"id": "bg-1", "type": "background", "label": "Environment", "description": "Setting/background", "position": "full frame background"}
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance across all frames.
2. **tags**: 3-5 short tags (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **NO remixOptions**
5. Analyze ALL frames together
6. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
7. **environmentInteractions**: CRITICAL - HOW object physically interacts with environment ("50% inserted into pipe", "resting on table", "embedded in wall"). Required for accurate replacement.
8. **visibilityPercent**: 0-100, how much of object is visible (100=fully visible, 50=half hidden)
9. **contactPoints**: WHERE object touches surfaces - "wheels on road", "hands on table"
10. **occlusionInfo**: What hides this object - "front half hidden by pipe", "lower body behind desk"`;

// Промпт для unified анализа с привязкой к сценам
const UNIFIED_ANALYSIS_PROMPT = `Analyze this video and identify unique visual elements. Track which scenes each element appears in.

SCENE BOUNDARIES (detected automatically):
{sceneBoundaries}

Return JSON:
{
  "duration": 15,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing behind kitchen counter",
      "visibilityPercent": 70,
      "contactPoints": "hands on countertop",
      "occlusionInfo": "lower body hidden by counter",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5},
        {"sceneIndex": 2, "startTime": 7.2, "endTime": 10.0}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Sports Car",
      "description": "Red Porsche 911, shiny paint, chrome wheels",
      "position": "center-left foreground",
      "environmentInteractions": "50% inserted into large metal pipe from right side",
      "visibilityPercent": 50,
      "contactPoints": "rear wheels on tarmac, front inside pipe",
      "occlusionInfo": "front half hidden by pipe, Santa sitting on top",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5}
      ]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Modern Kitchen",
      "description": "Minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5},
        {"sceneIndex": 1, "startTime": 3.5, "endTime": 7.2}
      ]
    }
  ]
}

RULES:
1. **UNIQUE ELEMENTS**: Each real-world entity = ONE element. Same person/object in multiple scenes = ONE element with multiple appearances.
2. **appearances**: Array of scenes where this element is visible. Use ONLY sceneIndex values from SCENE BOUNDARIES above.
3. **ELEMENT COUNT**: 3-6 elements total, ranked by visual importance.
4. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
5. **NO remixOptions** - they will be generated separately.
6. **description**: Specific visual details (materials, colors, clothing, features).
7. **Match scene boundaries**: startTime/endTime must match the provided SCENE BOUNDARIES exactly.
8. **environmentInteractions**: CRITICAL - HOW object physically interacts with environment ("50% inserted into pipe from right", "resting on table", "held by hands"). This is essential for accurate replacement.
9. **visibilityPercent**: 0-100, how much of object is visible (100=fully visible, 50=half hidden by occlusion)
10. **contactPoints**: WHERE object touches surfaces - "wheels on road", "hands on cup", "front inside pipe"
11. **occlusionInfo**: What hides this object AND what sits on top - "front half hidden by pipe, Santa on top"`;

const FRAMES_ANALYSIS_PROMPT = `Identify key visual elements in these video frames for AI remix.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Main Subject",
      "description": "Detailed description of person/animal visible across frames",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Cyberpunk android with glowing circuitry"},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Ethereal elf with pointed ears"},
        {"id": "opt-3", "label": "Anime Character", "icon": "🎌", "prompt": "Anime style with large eyes"}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Key Object",
      "description": "Most prominent object",
      "remixOptions": [...]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Environment",
      "description": "Setting/background",
      "remixOptions": [...]
    }
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance.
2. **tags**: 3-5 short tags (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **remixOptions**: EXACTLY 4 per element. NOT 3, NOT 5, NOT 6. EXACTLY 4. RANKED by visual impact.
5. Analyze ALL frames together
6. Diverse styles: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi`;

const JSON_REGEX = /\{[\s\S]*\}/;

// Настройки безопасности - снижаем чувствительность для анализа видеоконтента
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

/**
 * Проверяет ответ Gemini на блокировку и извлекает текст
 * @throws Error с понятным сообщением если ответ заблокирован
 */
function extractTextFromResponse(response: {
  text: () => string;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{ category: string; probability: string }>;
  };
  candidates?: Array<{
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      blocked?: boolean;
    }>;
  }>;
}): string {
  // Проверяем блокировку промпта
  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `Запрос заблокирован Gemini: ${response.promptFeedback.blockReason}. Возможно, видео содержит контент, который модерация считает неприемлемым.`
    );
  }

  // Проверяем блокировку ответа
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") {
    const blockedCategories = candidate.safetyRatings
      ?.filter((r) => r.blocked)
      .map((r) => r.category)
      .join(", ");
    throw new Error(
      `Ответ заблокирован модерацией Gemini${blockedCategories ? `: ${blockedCategories}` : ""}. Попробуйте другое видео.`
    );
  }

  if (candidate?.finishReason === "OTHER") {
    throw new Error(
      "Gemini не смог обработать видео по неизвестной причине. Попробуйте другое видео или повторите попытку позже."
    );
  }

  try {
    return response.text();
  } catch (error) {
    // Если .text() выбросил исключение, даём понятное сообщение
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("blocked")) {
      throw new Error(
        "Контент заблокирован модерацией Gemini. Видео может содержать неприемлемый контент. Попробуйте другое видео."
      );
    }
    throw error;
  }
}

/**
 * Callback для отслеживания прогресса операций Gemini
 */
export type GeminiProgressCallback = (
  stage: string,
  percent: number,
  message: string
) => void | Promise<void>;

type GeminiRawAnalysis = {
  duration?: number | string | null;
  aspectRatio?: string;
  tags?: string[];
  elements?: DetectableElement[];
};

function parseDuration(
  duration: number | string | null | undefined
): number | null {
  return typeof duration === "string"
    ? Number.parseInt(duration, 10) || null
    : (duration ?? null);
}

function parseRawAnalysis(raw: GeminiRawAnalysis): VideoAnalysis {
  // Ограничиваем до 6 элементов (берём первые - самые важные по ранжированию AI)
  let elements = raw.elements || [];
  if (elements.length > 6) {
    elements = elements.slice(0, 6);
  }

  return {
    duration: parseDuration(raw.duration),
    aspectRatio: raw.aspectRatio || "9:16",
    tags: raw.tags || [],
    elements,
  };
}

type RawAnalysisWithoutOptions = {
  duration?: number | string | null;
  aspectRatio?: string;
  tags?: string[];
  elements?: ElementWithoutOptions[];
};

function parseRawAnalysisWithoutOptions(
  raw: RawAnalysisWithoutOptions
): VideoAnalysisWithoutOptions {
  return {
    duration: parseDuration(raw.duration),
    aspectRatio: raw.aspectRatio || "9:16",
    tags: raw.tags || [],
    elements: raw.elements || [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRawAnalysis = any;

// Параметры для универсального анализа
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
   * Универсальный метод анализа контента через Gemini
   * Обрабатывает логирование, progress, генерацию и парсинг ответа
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

      // Формируем outputMeta в зависимости от типа результата
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
        inputMeta,
        outputMeta,
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
        // Проверка таймаута обработки файла
        if (Date.now() - startTime > timeouts.geminiProcessing) {
          throw new Error(
            `Gemini processing timeout: файл обрабатывается дольше ${timeouts.geminiProcessing / 1000 / 60} минут`
          );
        }

        pollCount += 1;
        // Прогресс от 10% до 50% во время обработки файла
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
   * @param videoBuffer Video file buffer
   * @param framesServiceUrl URL of the video-frames service
   * @param intervalSec Interval between frames in seconds
   * @param onProgress Optional progress callback
   * @returns VideoAnalysis result
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
  // UNIFIED АНАЛИЗ (элементы с привязкой к сценам)
  // ============================================

  /**
   * Анализирует видео с учётом границ сцен
   * Возвращает плоский список уникальных элементов с appearances (в каких сценах появляются)
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

      // Формируем строку с границами сцен для промпта
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

      const duration =
        typeof raw.duration === "string"
          ? Number.parseInt(raw.duration, 10) || null
          : (raw.duration ?? null);

      // Ограничиваем до 6 элементов
      let elements = raw.elements || [];
      if (elements.length > 6) {
        elements = elements.slice(0, 6);
      }

      await onProgress?.("analyzing", 90, "Unified анализ завершён");

      const result2: UnifiedVideoAnalysis = {
        duration,
        aspectRatio: raw.aspectRatio || "9:16",
        tags: raw.tags || [],
        elements,
      };

      await logHandle.success({
        inputMeta: { scenesCount: sceneBoundaries.length },
        outputMeta: {
          elementsCount: result2.elements.length,
          tags: result2.tags,
        },
      });

      return result2;
    } catch (error) {
      await logHandle.fail(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // ============================================
  // МЕТОДЫ ДЛЯ ENCHANTING РЕЖИМА (без вариантов)
  // ============================================

  /**
   * Анализирует видео и возвращает только элементы БЕЗ remix-вариантов
   * Используется для enchanting режима, где варианты генерирует ChatGPT
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
   * Обрабатывает видео и возвращает только элементы БЕЗ вариантов
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
   * Анализирует кадры и возвращает только элементы БЕЗ remix-вариантов
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
   * Обрабатывает видео по кадрам и возвращает только элементы БЕЗ вариантов
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

let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    if (!geminiConfig.isConfigured()) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiServiceInstance = new GeminiService(geminiConfig.apiKey);
  }
  return geminiServiceInstance;
}

export const isGeminiConfigured = geminiConfig.isConfigured;
