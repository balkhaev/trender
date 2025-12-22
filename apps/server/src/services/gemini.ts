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

// Extended video analysis for Kling OmniVideo
export type VideoAnalysis = {
  // Quick mode fields (5-10 main parameters)
  subject: string;
  action: string;
  environment: string;
  cameraStyle: string;
  mood: string;
  colorPalette: string;
  style: string;
  duration: number | null;
  aspectRatio: string;

  // Pro mode fields (detailed analysis)
  scenes: VideoScene[];
  characters: VideoCharacter[];
  objects: VideoObject[];
  cameraMovements: CameraMovement[];
  lighting: string;
  transitions: VideoTransition[];
  audio: VideoAudio;
  textOverlays: TextOverlay[];

  // Legacy fields
  pacing: string;
  cameraWork: string;

  // Prompts
  klingPrompt: string;
  veo3Prompt: string;
  tags: string[];
};

const ANALYSIS_PROMPT = `You are an expert video analyst for AI video generation. Analyze this video in extreme detail to enable recreation using Kling AI OmniVideo (video-to-video generation).

IMPORTANT: Be extremely specific and concrete. Avoid vague terms. Describe exactly what you see.

Respond in JSON format with the following structure:

{
  "subject": "Main subject of the video. Detailed description including: who/what is the focus, age/type, appearance, distinctive features. Example: 'A woman in her late 20s with long dark wavy hair, wearing a cream linen dress and gold jewelry, holding a ceramic coffee cup'",
  
  "action": "Primary action happening. Start with active verb. Example: 'Walks slowly through a sunlit kitchen, pauses to look out the window, takes a sip of coffee while gazing outside'",
  
  "environment": "Detailed setting. Include: location type, time of day, weather, atmosphere, key elements. Example: 'Modern minimalist kitchen with white marble counters, morning sunlight streaming through large windows, potted herbs on windowsill, steam rising from coffee'",
  
  "cameraStyle": "Overall camera style summary. Example: 'Smooth cinematic tracking shots with shallow depth of field, eye-level perspective, intimate framing'",
  
  "mood": "Emotional atmosphere. Example: 'Peaceful and contemplative, quiet morning solitude, warm and cozy'",
  
  "colorPalette": "Dominant colors and grading. Example: 'Warm tones: cream, gold, soft brown. Lifted shadows, warm highlights, subtle film grain'",
  
  "style": "Visual style category. One of: cinematic, documentary, commercial, music video, social media, vlog, tutorial, artistic. Add specifics.",
  
  "duration": "Estimated duration in seconds (number only)",
  
  "aspectRatio": "Video aspect ratio: '16:9', '9:16', '1:1', '4:3', or '21:9'",
  
  "scenes": [
    {
      "timestamp": "0:00-0:03",
      "description": "Scene setting and context",
      "action": "What happens in this scene segment"
    }
  ],
  
  "characters": [
    {
      "id": "person1",
      "age": "mid-20s",
      "gender": "female",
      "appearance": "Tall, slim build, dark wavy hair past shoulders, fair skin",
      "clothing": "Cream linen midi dress, thin gold chain necklace, bare feet",
      "actions": "Moves gracefully through kitchen, holds coffee cup, gazes out window"
    }
  ],
  
  "objects": [
    {
      "name": "coffee cup",
      "role": "interactive prop",
      "position": "held in subject's hands",
      "description": "Large ceramic mug, light gray with matte finish, steam rising"
    }
  ],
  
  "cameraMovements": [
    {
      "type": "dolly",
      "direction": "forward",
      "speed": "slow",
      "startTime": "0:00",
      "endTime": "0:04"
    }
  ],
  
  "lighting": "Detailed lighting description. Include: source direction, quality (hard/soft), color temperature, shadows, practical lights. Example: 'Natural morning light from large windows on the right, creating soft shadows and warm golden highlights. Backlit subject creating rim light on hair.'",
  
  "transitions": [
    {
      "type": "cut",
      "timestamp": "0:03"
    }
  ],
  
  "audio": {
    "music": "Soft ambient piano, slow tempo, major key",
    "speech": "No dialogue, ambient sounds only",
    "effects": "Coffee cup clink, distant birds, soft footsteps",
    "mood": "Peaceful, calm, morning atmosphere"
  },
  
  "textOverlays": [
    {
      "text": "Text if visible",
      "timestamp": "0:00",
      "position": "bottom center",
      "style": "white sans-serif caption"
    }
  ],
  
  "pacing": "Overall rhythm and tempo of the video",
  
  "cameraWork": "Legacy: detailed camera description for compatibility",
  
  "klingPrompt": "Write a prompt for Kling AI video-to-video. Format: 'Based on @Video1, [describe what to keep and what to change]. Keep the [specific elements to preserve]. Change [elements to modify].' Be specific about motion, timing, and style.",
  
  "veo3Prompt": "Write a single dense paragraph that could recreate this video from scratch. Structure: [Camera movement], [Subject description] [performs action] in [environment]. [Lighting]. [Style and color grading].",
  
  "tags": ["5-20 semantic topic tags. Lowercase, no #, unique. Examples: lifestyle, morning-routine, coffee, minimalist, aesthetic"]
}

CRITICAL RULES:
- Extract EVERY detail visible in the video
- Be specific about timing, positions, movements
- Describe colors, textures, materials precisely
- Note ALL people, objects, and their interactions
- Identify camera movements from frame changes
- If something is unclear, describe what you actually see
- NO vague terms like "dynamic", "interesting", "beautiful"
- NO abstract concepts - only what is literally visible`;

const FRAMES_ANALYSIS_PROMPT = `You are an expert video analyst for AI video generation. You are given a sequence of frames extracted from a video (every 2 seconds). Analyze ALL frames together to understand the complete video and extract precise details needed for Kling AI OmniVideo recreation.

IMPORTANT: 
- Consider ALL frames as a continuous sequence
- Infer motion and camera movement from changes between frames
- Be extremely specific and concrete

Respond in JSON format with the following structure:

{
  "subject": "Main subject of the video. Detailed description including: who/what is the focus, age/type, appearance, distinctive features",
  
  "action": "Primary action happening across all frames. Start with active verb. Describe the progression from first to last frame",
  
  "environment": "Detailed setting. Include: location type, time of day, weather, atmosphere, key elements",
  
  "cameraStyle": "Overall camera style inferred from frame changes. Describe movement patterns, framing, perspective",
  
  "mood": "Emotional atmosphere of the video",
  
  "colorPalette": "Dominant colors and color grading visible in frames",
  
  "style": "Visual style category: cinematic, documentary, commercial, music video, social media, vlog, tutorial, artistic",
  
  "duration": "Estimated total duration in seconds based on frame count (number only, null if unknown)",
  
  "aspectRatio": "Video aspect ratio: '16:9', '9:16', '1:1', '4:3', or '21:9'",
  
  "scenes": [{"timestamp": "0:00-0:03", "description": "Scene setting", "action": "What happens"}],
  
  "characters": [{"id": "person1", "age": "estimate", "gender": "if visible", "appearance": "physical details", "clothing": "what they wear", "actions": "what they do"}],
  
  "objects": [{"name": "object name", "role": "purpose in video", "position": "where in frame", "description": "visual details"}],
  
  "cameraMovements": [{"type": "movement type", "direction": "direction", "speed": "slow/medium/fast", "startTime": "0:00", "endTime": "0:03"}],
  
  "lighting": "Lighting conditions visible in frames",
  
  "transitions": [{"type": "cut/fade/dissolve", "timestamp": "when"}],
  
  "audio": {"music": "inferred from visual cues or none", "speech": "if lips moving or text indicates", "effects": "likely sounds", "mood": "audio atmosphere guess"},
  
  "textOverlays": [{"text": "visible text", "timestamp": "when", "position": "where", "style": "appearance"}],
  
  "pacing": "Rhythm inferred from frame changes",
  
  "cameraWork": "Detailed camera behavior inferred from frame-to-frame changes",
  
  "klingPrompt": "Write a prompt for Kling AI video-to-video. Format: 'Based on @Video1, [describe what to keep and what to change]. Keep the [specific elements]. Change [elements to modify].'",
  
  "veo3Prompt": "Single dense paragraph to recreate this video from scratch",
  
  "tags": ["5-20 semantic tags, lowercase, no #"]
}

CRITICAL RULES:
- Analyze ALL frames together as a sequence
- Infer timing from frame positions
- Describe what changes between frames (that's the motion)
- Be specific about all visible elements
- NO vague terms like "dynamic", "interesting", "beautiful"`;

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
  subject: string;
  action: string;
  environment: string;
  cameraStyle?: string;
  cameraWork?: string;
  mood?: string;
  colorPalette: string;
  style: string;
  duration?: number | string | null;
  aspectRatio?: string;
  scenes?: VideoScene[];
  characters?: VideoCharacter[];
  objects?: VideoObject[];
  cameraMovements?: CameraMovement[];
  lighting: string;
  transitions?: VideoTransition[];
  audio?: Partial<VideoAudio>;
  textOverlays?: TextOverlay[];
  pacing?: string;
  klingPrompt?: string;
  veo3Prompt?: string;
  tags?: string[];
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Data transformation function naturally has many field mappings
function parseRawAnalysis(raw: GeminiRawAnalysis): Omit<VideoAnalysis, "tags"> {
  const duration =
    typeof raw.duration === "string"
      ? Number.parseInt(raw.duration, 10) || null
      : (raw.duration ?? null);

  return {
    subject: raw.subject || "",
    action: raw.action || "",
    environment: raw.environment || "",
    cameraStyle: raw.cameraStyle || raw.cameraWork || "",
    mood: raw.mood || "",
    colorPalette: raw.colorPalette || "",
    style: raw.style || "",
    duration,
    aspectRatio: raw.aspectRatio || "9:16",
    scenes: raw.scenes || [],
    characters: raw.characters || [],
    objects: raw.objects || [],
    cameraMovements: raw.cameraMovements || [],
    lighting: raw.lighting || "",
    transitions: raw.transitions || [],
    audio: {
      music: raw.audio?.music || "",
      speech: raw.audio?.speech || "",
      effects: raw.audio?.effects || "",
      mood: raw.audio?.mood || "",
    },
    textOverlays: raw.textOverlays || [],
    pacing: raw.pacing || "",
    cameraWork: raw.cameraWork || raw.cameraStyle || "",
    klingPrompt: raw.klingPrompt || "",
    veo3Prompt: raw.veo3Prompt || "",
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
    const { normalizeTags } = await import("../lib/tag-trends");
    const parsed = parseRawAnalysis(raw);

    await onProgress?.("analyzing", 90, "Анализ завершён");

    return {
      ...parsed,
      tags: normalizeTags(raw.tags ?? []),
    };
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
    const { normalizeTags } = await import("../lib/tag-trends");
    const parsed = parseRawAnalysis(raw);

    await onProgress?.("analyzing", 90, "Анализ кадров завершён");

    return {
      ...parsed,
      tags: normalizeTags(raw.tags ?? []),
    };
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
