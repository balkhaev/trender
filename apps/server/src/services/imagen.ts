/**
 * Сервис генерации изображений через Google Gemini Imagen
 */
import { GoogleGenAI, PersonGeneration } from "@google/genai";
import prisma from "@trender/db";
import { ai } from "../config";
import { getS3Key, isS3Configured, s3Service } from "./s3";
import { getMediaPublicUrl } from "./url-builder";

export type AssetCategory = "background" | "character" | "object" | "texture";
export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export type GenerateAssetParams = {
  prompt: string;
  category: AssetCategory;
  aspectRatio?: AspectRatio;
  style?: string;
  userId: string;
};

export type GeneratedAsset = {
  id: string;
  url: string;
  prompt: string;
  category: AssetCategory;
  width?: number;
  height?: number;
};

// Пресеты стилей
export const STYLE_PRESETS = {
  realistic: "photorealistic, high detail, 8k resolution",
  cartoon: "cartoon style, vibrant colors, flat shading",
  anime: "anime style, Japanese animation aesthetic",
  "3d": "3D rendered, CGI, smooth surfaces",
  watercolor: "watercolor painting, soft edges, artistic",
  pixel: "pixel art, retro game style, 8-bit aesthetic",
  minimalist: "minimalist, clean lines, simple shapes",
  cinematic: "cinematic, dramatic lighting, movie quality",
} as const;

// Категории с подсказками для промптов
export const CATEGORY_PROMPTS: Record<AssetCategory, string> = {
  background: "Background scene, environment, no people or objects in focus:",
  character:
    "Character portrait, single person or creature, centered composition:",
  object:
    "Single object, isolated, clean background, product photography style:",
  texture: "Seamless tileable texture pattern, repeating design:",
};

export class ImagenService {
  private genai: GoogleGenAI;

  constructor() {
    if (!ai.gemini.isConfigured()) {
      throw new Error("GEMINI_API_KEY is required for Imagen");
    }
    this.genai = new GoogleGenAI({ apiKey: ai.gemini.apiKey });
  }

  /**
   * Генерация изображения
   */
  async generateAsset(params: GenerateAssetParams): Promise<GeneratedAsset> {
    const { prompt, category, aspectRatio = "1:1", style, userId } = params;

    // Формируем полный промпт
    const fullPrompt = this.buildPrompt(prompt, category, style);

    console.log(
      `[Imagen] Generating ${category} asset: "${prompt.slice(0, 50)}..."`
    );

    // Генерируем изображение через Imagen
    const response = await this.genai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: fullPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio,
        // Разрешаем персонажей для категории character
        personGeneration:
          category === "character"
            ? PersonGeneration.ALLOW_ADULT
            : PersonGeneration.DONT_ALLOW,
      },
    });

    if (!response.generatedImages?.[0]) {
      throw new Error("No image generated");
    }

    const imageData = response.generatedImages[0].image;
    if (!imageData?.imageBytes) {
      throw new Error("No image data in response");
    }

    const buffer = Buffer.from(imageData.imageBytes, "base64");

    // Проверяем S3
    if (!isS3Configured()) {
      throw new Error("S3 storage not configured");
    }

    // Сохраняем в S3
    const mediaId = crypto.randomUUID();
    const s3Key = getS3Key("media", `${userId}/${mediaId}.png`);
    await s3Service.uploadFile(s3Key, buffer, "image/png");

    const url = getMediaPublicUrl(s3Key);

    // Определяем размеры по aspectRatio
    const dimensions = this.getDimensions(aspectRatio);

    // Сохраняем в БД
    const media = await prisma.userMedia.create({
      data: {
        id: mediaId,
        userId,
        type: "image",
        filename: `${category}-${Date.now()}.png`,
        s3Key,
        url,
        size: buffer.length,
        mimeType: "image/png",
        width: dimensions.width,
        height: dimensions.height,
        source: "generated",
        category,
        prompt: fullPrompt,
        style: style || null,
        generationParams: { aspectRatio },
      },
    });

    console.log(`[Imagen] Generated asset saved: ${media.id}`);

    return {
      id: media.id,
      url: media.url,
      prompt: fullPrompt,
      category,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  /**
   * Формирование промпта с учётом категории и стиля
   */
  private buildPrompt(
    basePrompt: string,
    category: AssetCategory,
    style?: string
  ): string {
    const categoryPrefix = CATEGORY_PROMPTS[category];
    let prompt = `${categoryPrefix} ${basePrompt}`;

    if (style) {
      const styleDescription =
        STYLE_PRESETS[style as keyof typeof STYLE_PRESETS] || style;
      prompt += `, ${styleDescription}`;
    }

    return prompt;
  }

  /**
   * Получение размеров по aspectRatio
   */
  private getDimensions(aspectRatio: AspectRatio): {
    width: number;
    height: number;
  } {
    const baseSize = 1024;
    switch (aspectRatio) {
      case "1:1":
        return { width: baseSize, height: baseSize };
      case "3:4":
        return { width: 768, height: 1024 };
      case "4:3":
        return { width: 1024, height: 768 };
      case "9:16":
        return { width: 576, height: 1024 };
      case "16:9":
        return { width: 1024, height: 576 };
      default:
        return { width: baseSize, height: baseSize };
    }
  }

  /**
   * Получение списка категорий с примерами
   */
  getCategories() {
    return [
      {
        id: "background",
        label: "Фоны",
        description: "Сцены, окружение, пейзажи",
        examples: [
          "Футуристический город на закате",
          "Уютная кофейня в дождь",
          "Космическая станция",
        ],
      },
      {
        id: "character",
        label: "Персонажи",
        description: "Люди, существа, герои",
        examples: [
          "Киберпанк девушка с неоновыми волосами",
          "Милый робот-помощник",
          "Сказочный эльф в лесу",
        ],
      },
      {
        id: "object",
        label: "Объекты",
        description: "Предметы, вещи, продукты",
        examples: [
          "Светящийся кристалл",
          "Винтажная камера",
          "Волшебная книга",
        ],
      },
      {
        id: "texture",
        label: "Текстуры",
        description: "Паттерны, материалы, поверхности",
        examples: [
          "Мраморная поверхность",
          "Деревянные доски",
          "Металлическая сетка",
        ],
      },
    ];
  }

  /**
   * Получение пресетов стилей
   */
  getStylePresets() {
    return Object.entries(STYLE_PRESETS).map(([id, description]) => ({
      id,
      label: this.getStyleLabel(id),
      description,
    }));
  }

  private getStyleLabel(id: string): string {
    const labels: Record<string, string> = {
      realistic: "Реалистичный",
      cartoon: "Мультяшный",
      anime: "Аниме",
      "3d": "3D",
      watercolor: "Акварель",
      pixel: "Пиксель-арт",
      minimalist: "Минимализм",
      cinematic: "Кинематографичный",
    };
    return labels[id] || id;
  }
}

// Singleton instance
let imagenServiceInstance: ImagenService | null = null;

export function getImagenService(): ImagenService {
  if (!imagenServiceInstance) {
    imagenServiceInstance = new ImagenService();
  }
  return imagenServiceInstance;
}
