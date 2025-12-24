import OpenAI from "openai";
import { ai, timeouts } from "../config";
import { aiLogger } from "./ai-logger";
import type { DetectableElement, RemixOption } from "./gemini";
import { withTimeout } from "./utils";

const openaiConfig = ai.openai;

// Элемент без вариантов (для передачи в ChatGPT)
export type ElementWithoutOptions = Omit<DetectableElement, "remixOptions">;

// Результат генерации вариантов от ChatGPT
export type EnchantingResult = {
  id: string;
  type: "character" | "object" | "background";
  remixOptions: RemixOption[];
};

const NORMAL_ABSURD_REMIX_PROMPT = `
Generate replacement options for AI video remixing.

Input: JSON list of elements with id, type, label, description.

Your task: For EACH element, generate EXACTLY 4 remixOptions RANKED by visual impact:
- Options 1-2 = most dramatic/viral (absurd, meme-like)
- Options 3-4 = more subtle but interesting

CRITICAL: You MUST generate EXACTLY 4 options per element. NOT 3, NOT 5, NOT 6. EXACTLY 4.

RULES BY TYPE:

CHARACTER (replacing WHO):
- Dramatic: mascots, toys, animals, cursed humans, exaggerated proportions
- Subtle: realistic roles, mild stylization, cinematic archetypes
- Pose and motion MUST stay same

OBJECT (replacing WHAT):
- Dramatic: living objects, impossible materials, ironic luxury
- Subtle: believable objects, realistic materials
- Position MUST stay same

BACKGROUND (replacing WHERE):
- Dramatic: surreal locations, awkward/ironic places
- Subtle: realistic locations, cinematic environments
- Composition MUST stay same

OUTPUT FORMAT:

[
  {
    "id": "<element id>",
    "type": "<type>",
    "remixOptions": [
      {"id": "opt-1", "label": "2-3 words", "icon": "emoji", "prompt": "Clear replacement description"},
      {"id": "opt-2", "label": "...", "icon": "...", "prompt": "..."},
      {"id": "opt-3", "label": "...", "icon": "...", "prompt": "..."},
      {"id": "opt-4", "label": "...", "icon": "...", "prompt": "..."}
    ]
  }
]

RULES:
- EXACTLY 4 options per element (this is mandatory)
- Each option must clearly REPLACE the original
- Concrete visual descriptions, no abstract language
- Return ONLY valid JSON array
`;

const ENHANCE_PROMPT_FOR_KLING = `
You are an expert at writing prompts for Kling AI video generation.

Your task: Take the user's remix prompt and ENHANCE it to maximize visual quality, PRECISION in object targeting, and REALISTIC PHYSICS.

KLING AI SPECIFICS:
- Kling uses <<<video_1>>> to reference the source video
- Kling uses <<<image_1>>>, <<<element_1>>> for image references
- Kling works best with specific, visual descriptions
- Focus on: textures, materials, lighting, colors, style
- Avoid abstract concepts - be concrete and visual

CRITICAL - OBJECT TARGETING PRECISION:
When replacing objects, you MUST specify:
1. The exact visual characteristics of the TARGET object (color, shape, size, material)
2. Its position in the frame (left/center/right, foreground/background)
3. What should remain UNCHANGED around it
4. Use "surgical" language: "Replace ONLY the...", "Target specifically the..."

CRITICAL - PHYSICS AND SPATIAL REALISM:
When replacing objects, you MUST ensure:
1. The replacement maintains EXACT angle, orientation, and perspective of the original
2. The replacement interacts REALISTICALLY with the environment (sits on ground properly, follows road contours, obeys gravity)
3. Wheels/contact points touch surfaces correctly - no floating, no clipping through objects
4. Motion and trajectory match the original object's movement
5. Scale is proportionally correct relative to surroundings
6. Shadows and reflections are consistent with the scene

ENHANCEMENT RULES:
1. Keep ALL original <<<video_1>>>, <<<image_N>>>, <<<element_N>>> references EXACTLY as they are
2. Expand vague descriptions into specific visual details with position hints
3. Add style keywords: realistic, cinematic, high quality, detailed
4. ALWAYS add physics instructions: "maintain realistic ground contact", "preserve correct perspective and angle"
5. Keep the prompt concise but descriptive (max 250 words)
6. Preserve the original intent and all transformations
7. If "Keep unchanged:" list exists, reinforce it in the enhanced prompt
8. Output ONLY the enhanced prompt, nothing else

EXAMPLE:
Input: "Replace ONLY the Porsche (red sports car) located center-left with <<<image_1>>>. Keep unchanged: Santa Claus, House"
Output: "Based on <<<video_1>>>, replace ONLY the bright red Porsche 911 sports car located in the center-left of the frame with the reference from <<<image_1>>>. CRITICAL: The replacement vehicle MUST maintain the exact same angle, orientation, and perspective as the original. Wheels must have realistic ground contact - no floating or clipping. The vehicle must follow the same trajectory and motion path. Preserve correct scale relative to surroundings. Match lighting, shadows, and reflections. Keep all other elements completely unchanged, especially the Santa Claus figure and the house in the background. High quality, physically realistic, seamless integration."
`;

export class OpenAIService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Улучшает промпт для Kling AI через ChatGPT
   * @param prompt Исходный промпт из buildElementPrompt()
   * @param generationId ID генерации для логирования
   * @returns Улучшенный промпт для Kling
   */
  async enhancePromptForKling(
    prompt: string,
    generationId?: string
  ): Promise<string> {
    const logHandle = await aiLogger.startTimer({
      provider: "openai",
      operation: "enhancePromptForKling",
      model: "gpt-4o-mini",
      reelId: generationId,
    });

    try {
      const response = await withTimeout(
        this.client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: ENHANCE_PROMPT_FOR_KLING,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
        timeouts.openaiApi,
        "OpenAI enhancePromptForKling"
      );

      const enhancedPrompt = response.choices[0]?.message?.content?.trim();
      if (!enhancedPrompt) {
        throw new Error("Empty response from ChatGPT");
      }

      await logHandle.success({
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        inputMeta: { originalPrompt: prompt },
        outputMeta: { enhancedPrompt },
      });

      return enhancedPrompt;
    } catch (error) {
      await logHandle.fail(
        error instanceof Error ? error : new Error(String(error))
      );
      // При ошибке возвращаем оригинальный промпт
      return prompt;
    }
  }

  /**
   * Генерирует remix-варианты для элементов через ChatGPT
   * @param elements Элементы без вариантов (от Gemini анализа)
   * @param reelId ID рила для логирования
   * @returns Элементы с сгенерированными вариантами
   */
  async generateEnchantingOptions(
    elements: ElementWithoutOptions[],
    reelId?: string
  ): Promise<EnchantingResult[]> {
    if (elements.length === 0) {
      return [];
    }

    const logHandle = await aiLogger.startTimer({
      provider: "openai",
      operation: "generateEnchantingOptions",
      model: "gpt-4o",
      reelId,
    });

    try {
      const inputJson = JSON.stringify(
        elements.map((e) => ({
          id: e.id,
          type: e.type,
          label: e.label,
          description: e.description,
        })),
        null,
        2
      );

      const response = await withTimeout(
        this.client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: NORMAL_ABSURD_REMIX_PROMPT,
            },
            {
              role: "user",
              content: `Generate remix options for these elements:\n\n${inputJson}`,
            },
          ],
          temperature: 0.8,
          max_tokens: 4000,
        }),
        timeouts.openaiApi,
        "OpenAI generateEnchantingOptions"
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from ChatGPT");
      }

      const parseResult = extractJsonArray<EnchantingResult>(content);
      if (!parseResult.success) {
        throw new Error(
          `Failed to parse ChatGPT response: ${parseResult.error}`
        );
      }

      const results = parseResult.data;

      // Валидация результатов
      for (const result of results) {
        if (!(result.id && result.type && result.remixOptions)) {
          throw new Error(`Invalid result structure for element ${result.id}`);
        }
        if (result.remixOptions.length !== 4) {
          throw new Error(
            `Expected exactly 4 options for element ${result.id}, got ${result.remixOptions.length}`
          );
        }
      }

      await logHandle.success({
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        inputMeta: { elementsCount: elements.length },
        outputMeta: {
          resultsCount: results.length,
          optionsCount: results.reduce(
            (acc, r) => acc + r.remixOptions.length,
            0
          ),
        },
      });

      return results;
    } catch (error) {
      await logHandle.fail(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

let openaiServiceInstance: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
  if (!openaiServiceInstance) {
    if (!openaiConfig.isConfigured()) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openaiServiceInstance = new OpenAIService(openaiConfig.apiKey);
  }
  return openaiServiceInstance;
}

export const isOpenAIConfigured = openaiConfig.isConfigured;
