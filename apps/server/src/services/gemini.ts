import { unlink, writeFile } from "node:fs/promises";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";

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
  elements: DetectableElement[];
};

// Элемент без вариантов (для enchanting режима)
export type ElementWithoutOptions = Omit<DetectableElement, "remixOptions">;

// Анализ видео без вариантов (для enchanting режима)
export type VideoAnalysisWithoutOptions = {
  duration: number | null;
  aspectRatio: string;
  elements: ElementWithoutOptions[];
};

const ANALYSIS_PROMPT = `You are an expert at identifying key visual elements in videos for AI video remix generation.

Your task: Identify the KEY ELEMENTS in this video that can be transformed/replaced while keeping the same motion and composition.

Respond in JSON format:

{
  "duration": 5,
  "aspectRatio": "9:16",

  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "A woman in her late 20s with long dark wavy hair, wearing a cream linen dress, holding a coffee cup",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Transform the young woman into a cyberpunk android with glowing blue circuitry patterns on metallic silver skin, neon LED eyes, and chrome mechanical joints"},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Transform the young woman into an ethereal elf princess with pointed ears, flowing silver hair, glowing golden eyes, and delicate elvish robes"},
        {"id": "opt-3", "label": "Anime Character", "icon": "🎌", "prompt": "Transform the young woman into an anime style character with large expressive eyes, vibrant pink hair, and exaggerated cute expressions"},
        {"id": "opt-4", "label": "Victorian Lady", "icon": "👗", "prompt": "Transform the young woman into a Victorian era aristocrat with elaborate updo hairstyle, pearl jewelry, and ornate period dress with lace details"}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug with matte gray finish, steam rising",
      "remixOptions": [
        {"id": "opt-1", "label": "Magic Potion", "icon": "🧪", "prompt": "Transform the coffee cup into a bubbling magic potion in a crystal vial with swirling purple mist and glowing runes"},
        {"id": "opt-2", "label": "Alien Device", "icon": "👽", "prompt": "Transform the coffee cup into a sleek alien technology device with holographic display and floating energy orbs"},
        {"id": "opt-3", "label": "Golden Chalice", "icon": "🏆", "prompt": "Transform the coffee cup into an ornate golden chalice encrusted with rubies and emeralds, medieval royal style"},
        {"id": "opt-4", "label": "Living Plant", "icon": "🌱", "prompt": "Transform the coffee cup into a living plant creature with vine tendrils, flower eyes, and leaves forming a cup shape"}
      ]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen with white marble counters, morning sunlight through large windows",
      "remixOptions": [
        {"id": "opt-1", "label": "Spaceship Interior", "icon": "🚀", "prompt": "Transform the kitchen into a futuristic spaceship command center with holographic displays, chrome surfaces, and stars visible through viewport windows"},
        {"id": "opt-2", "label": "Medieval Castle", "icon": "🏰", "prompt": "Transform the kitchen into a medieval castle great hall with stone walls, torch lighting, tapestries, and a massive fireplace"},
        {"id": "opt-3", "label": "Underwater Palace", "icon": "🐠", "prompt": "Transform the kitchen into an underwater palace with coral walls, bioluminescent lighting, floating bubbles, and fish swimming past windows"},
        {"id": "opt-4", "label": "Enchanted Forest", "icon": "🌲", "prompt": "Transform the kitchen into a magical forest clearing with giant mushrooms, glowing fireflies, mystical fog, and ancient trees"}
      ]
    }
  ]
}

CRITICAL RULES:

1. **Identify ALL significant elements** in the video:
   - Characters (type: "character"): People, animals, creatures - use ids like "char-1", "char-2", etc.
   - Objects (type: "object"): Important items, props, tools - use ids like "obj-1", "obj-2", etc.
   - Backgrounds (type: "background"): Environments, settings - use ids like "bg-1", "bg-2", etc.
   - Include EVERY distinct element that could be transformed (no limit on count)

2. **ALWAYS return EXACTLY 4 remixOptions per element**:
   - Each with unique id: "opt-1", "opt-2", "opt-3", "opt-4"
   - Diverse styles: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi, Horror, Cartoon, Steampunk
   - TRANSFORMATIVE changes, not subtle modifications

3. **Label**: 2-3 words, creative name
4. **Icon**: Single emoji representing the transformation
5. **Prompt**: Detailed transformation description with specific visual details (materials, colors, textures, lighting effects)

6. **Quality requirements**:
   - Be SPECIFIC: "glowing neon blue circuitry on chrome skin" not just "futuristic"
   - Each option must be visually DISTINCT from others
   - Transformations must be compatible with the original motion/composition
   - Identify multiple characters if present (each person/animal gets own element)
   - Identify multiple objects if they are visually significant`;

// Промпт для анализа БЕЗ генерации вариантов (для enchanting режима)
const ELEMENTS_ONLY_PROMPT = `You are an expert at identifying key visual elements in videos for AI video remix generation.

Your task: Identify the KEY ELEMENTS in this video that can be transformed/replaced while keeping the same motion and composition.

DO NOT generate remixOptions - only identify and describe the elements.

Respond in JSON format:

{
  "duration": 5,
  "aspectRatio": "9:16",

  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "A woman in her late 20s with long dark wavy hair, wearing a cream linen dress, holding a coffee cup"
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug with matte gray finish, steam rising"
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen with white marble counters, morning sunlight through large windows"
    }
  ]
}

CRITICAL RULES:

1. **Identify ALL significant elements** in the video:
   - Characters (type: "character"): People, animals, creatures - use ids like "char-1", "char-2", etc.
   - Objects (type: "object"): Important items, props, tools - use ids like "obj-1", "obj-2", etc.
   - Backgrounds (type: "background"): Environments, settings - use ids like "bg-1", "bg-2", etc.
   - Include EVERY distinct element that could be transformed (no limit on count)

2. **DO NOT include remixOptions** - leave them out entirely

3. **Label**: 2-3 words, descriptive name
4. **Description**: Detailed description with specific visual details (materials, colors, textures, clothing, pose, etc.)

5. **Quality requirements**:
   - Be SPECIFIC in descriptions: "A woman in her late 20s with long dark wavy hair" not just "a woman"
   - Describe clothing, accessories, pose, expression for characters
   - Describe material, color, size, condition for objects
   - Describe lighting, style, key features for backgrounds`;

const FRAMES_ELEMENTS_ONLY_PROMPT = `You are an expert at identifying key visual elements in video frames for AI video remix generation.

You are given a sequence of frames from a video. Identify the KEY ELEMENTS that can be transformed/replaced.

DO NOT generate remixOptions - only identify and describe the elements.

Respond in JSON format:

{
  "duration": 5,
  "aspectRatio": "9:16",

  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Main Subject",
      "description": "Detailed description of the main person/animal/subject visible across frames"
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Key Object",
      "description": "Most prominent object visible in frames"
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Environment",
      "description": "The setting/background visible across frames"
    }
  ]
}

CRITICAL RULES:

1. **Identify ALL significant elements** visible in frames:
   - Characters (type: "character"): People, animals, creatures - ids: "char-1", "char-2", etc.
   - Objects (type: "object"): Important items, props - ids: "obj-1", "obj-2", etc.
   - Backgrounds (type: "background"): Environments - ids: "bg-1", "bg-2", etc.
   - No limit on element count - include EVERY distinct transformable element
2. **DO NOT include remixOptions**
3. **Analyze ALL frames together** to understand the complete scene
4. **Be SPECIFIC** in descriptions: include materials, colors, textures, clothing, poses
5. **Include multiple characters** if present - each person/animal gets own element`;

const FRAMES_ANALYSIS_PROMPT = `You are an expert at identifying key visual elements in video frames for AI video remix generation.

You are given a sequence of frames from a video. Identify the KEY ELEMENTS that can be transformed/replaced while keeping the same motion and composition.

Respond in JSON format:

{
  "duration": 5,
  "aspectRatio": "9:16",

  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Main Subject",
      "description": "Detailed description of the main person/animal/subject visible across frames",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Transform into cyberpunk android with glowing circuitry..."},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Transform into ethereal elf with pointed ears..."},
        {"id": "opt-3", "label": "Anime Character", "icon": "🎌", "prompt": "Transform into anime style with large eyes..."},
        {"id": "opt-4", "label": "Victorian Style", "icon": "👗", "prompt": "Transform into Victorian era aesthetic..."}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Key Object",
      "description": "Most prominent object visible in frames",
      "remixOptions": [...]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Environment",
      "description": "The setting/background visible across frames",
      "remixOptions": [...]
    }
  ]
}

CRITICAL RULES:

1. **Identify ALL significant elements** visible in frames:
   - Characters (type: "character"): People, animals, creatures - ids: "char-1", "char-2", etc.
   - Objects (type: "object"): Important items, props - ids: "obj-1", "obj-2", etc.
   - Backgrounds (type: "background"): Environments - ids: "bg-1", "bg-2", etc.
   - No limit on element count - include EVERY distinct transformable element
2. **ALWAYS return EXACTLY 4 remixOptions per element** with ids: opt-1, opt-2, opt-3, opt-4
3. **Analyze ALL frames together** to understand the complete scene
4. **Be SPECIFIC** in transformation prompts: include materials, colors, textures, lighting effects
5. **Diverse styles**: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi, Horror, Cartoon, Steampunk
6. **Include multiple characters** if present - each person/animal gets own element`;

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
  elements?: DetectableElement[];
};

function parseRawAnalysis(raw: GeminiRawAnalysis): VideoAnalysis {
  const duration =
    typeof raw.duration === "string"
      ? Number.parseInt(raw.duration, 10) || null
      : (raw.duration ?? null);

  return {
    duration,
    aspectRatio: raw.aspectRatio || "9:16",
    elements: raw.elements || [],
  };
}

export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  async uploadVideo(
    videoBuffer: Buffer,
    mimeType: string,
    displayName: string,
    onProgress?: GeminiProgressCallback
  ): Promise<string> {
    const tempPath = `/tmp/${Date.now()}-${displayName}`;
    await writeFile(tempPath, videoBuffer);

    await onProgress?.("uploading", 5, "Загрузка видео в Gemini...");

    try {
      const uploadResult = await this.fileManager.uploadFile(tempPath, {
        mimeType,
        displayName,
      });

      let file = uploadResult.file;
      let pollCount = 0;

      await onProgress?.(
        "uploading",
        10,
        "Файл загружен, ожидание обработки..."
      );

      while (file.state === FileState.PROCESSING) {
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
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysis> {
    await onProgress?.("analyzing", 55, "Запуск AI-анализа видео...");

    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      safetySettings: SAFETY_SETTINGS,
    });

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: "video/mp4",
          fileUri,
        },
      },
      { text: ANALYSIS_PROMPT },
    ]);

    await onProgress?.("analyzing", 80, "Обработка результатов анализа...");

    const response = result.response;
    const text = extractTextFromResponse(response);

    const jsonMatch = text.match(JSON_REGEX);
    if (!jsonMatch) {
      throw new Error("Failed to parse analysis response");
    }

    const raw = JSON.parse(jsonMatch[0]) as GeminiRawAnalysis;
    const parsed = parseRawAnalysis(raw);

    await onProgress?.("analyzing", 90, "Анализ завершён");

    return parsed;
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
   * @param frames Array of base64 encoded JPEG frames
   * @param onProgress Optional progress callback
   * @returns VideoAnalysis result
   */
  async analyzeFrames(
    frames: string[],
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysis> {
    if (frames.length === 0) {
      throw new Error("No frames provided for analysis");
    }

    await onProgress?.(
      "analyzing",
      55,
      `Анализ ${frames.length} кадров через Gemini AI...`
    );

    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      safetySettings: SAFETY_SETTINGS,
    });

    // Build content parts: all frames + prompt
    const imageParts = frames.map((base64) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64,
      },
    }));

    const result = await model.generateContent([
      ...imageParts,
      { text: FRAMES_ANALYSIS_PROMPT },
    ]);

    await onProgress?.("analyzing", 80, "Обработка результатов анализа...");

    const response = result.response;
    const text = extractTextFromResponse(response);

    const jsonMatch = text.match(JSON_REGEX);
    if (!jsonMatch) {
      throw new Error("Failed to parse analysis response");
    }

    const raw = JSON.parse(jsonMatch[0]) as GeminiRawAnalysis;
    const parsed = parseRawAnalysis(raw);

    await onProgress?.("analyzing", 90, "Анализ кадров завершён");

    return parsed;
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
  // МЕТОДЫ ДЛЯ ENCHANTING РЕЖИМА (без вариантов)
  // ============================================

  /**
   * Анализирует видео и возвращает только элементы БЕЗ remix-вариантов
   * Используется для enchanting режима, где варианты генерирует ChatGPT
   */
  async analyzeVideoElementsOnly(
    fileUri: string,
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysisWithoutOptions> {
    await onProgress?.(
      "analyzing",
      55,
      "Запуск AI-анализа видео (enchanting)..."
    );

    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      safetySettings: SAFETY_SETTINGS,
    });

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: "video/mp4",
          fileUri,
        },
      },
      { text: ELEMENTS_ONLY_PROMPT },
    ]);

    await onProgress?.("analyzing", 80, "Обработка результатов анализа...");

    const response = result.response;
    const text = extractTextFromResponse(response);

    const jsonMatch = text.match(JSON_REGEX);
    if (!jsonMatch) {
      throw new Error("Failed to parse analysis response");
    }

    const raw = JSON.parse(jsonMatch[0]) as {
      duration?: number | string | null;
      aspectRatio?: string;
      elements?: ElementWithoutOptions[];
    };

    const duration =
      typeof raw.duration === "string"
        ? Number.parseInt(raw.duration, 10) || null
        : (raw.duration ?? null);

    await onProgress?.("analyzing", 90, "Анализ элементов завершён");

    return {
      duration,
      aspectRatio: raw.aspectRatio || "9:16",
      elements: raw.elements || [],
    };
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
    onProgress?: GeminiProgressCallback
  ): Promise<VideoAnalysisWithoutOptions> {
    if (frames.length === 0) {
      throw new Error("No frames provided for analysis");
    }

    await onProgress?.(
      "analyzing",
      55,
      `Анализ ${frames.length} кадров (enchanting)...`
    );

    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      safetySettings: SAFETY_SETTINGS,
    });

    const imageParts = frames.map((base64) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64,
      },
    }));

    const result = await model.generateContent([
      ...imageParts,
      { text: FRAMES_ELEMENTS_ONLY_PROMPT },
    ]);

    await onProgress?.("analyzing", 80, "Обработка результатов анализа...");

    const response = result.response;
    const text = extractTextFromResponse(response);

    const jsonMatch = text.match(JSON_REGEX);
    if (!jsonMatch) {
      throw new Error("Failed to parse analysis response");
    }

    const raw = JSON.parse(jsonMatch[0]) as {
      duration?: number | string | null;
      aspectRatio?: string;
      elements?: ElementWithoutOptions[];
    };

    const duration =
      typeof raw.duration === "string"
        ? Number.parseInt(raw.duration, 10) || null
        : (raw.duration ?? null);

    await onProgress?.("analyzing", 90, "Анализ кадров завершён");

    return {
      duration,
      aspectRatio: raw.aspectRatio || "9:16",
      elements: raw.elements || [],
    };
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiServiceInstance = new GeminiService(apiKey);
  }
  return geminiServiceInstance;
}
