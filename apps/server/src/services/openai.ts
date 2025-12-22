import OpenAI from "openai";
import type { DetectableElement, RemixOption } from "./gemini";

// Элемент без вариантов (для передачи в ChatGPT)
export type ElementWithoutOptions = Omit<DetectableElement, "remixOptions">;

// Результат генерации вариантов от ChatGPT
export type EnchantingResult = {
  id: string;
  type: "character" | "object" | "background";
  remixOptions: RemixOption[];
};

const NORMAL_ABSURD_REMIX_PROMPT = `
You generate replacement options for AI video remixing.

Input:
A JSON list of detected elements.
Each element has:
- id
- type ("character" | "object" | "background")
- label
- description

Your task:
For EACH element, generate EXACTLY 4 replacement remixOptions:
- OPTIONS 1–2: NORMAL (simple, believable, appropriate, non-absurd)
- OPTIONS 3–4: ABSURD (cringe, meme-like, over-the-top, unexpected)

You MUST follow this ordering strictly.

---

### RULES BY TYPE

#### CHARACTER
You are replacing WHO the character is.

NORMAL options (1–2):
- realistic human roles or mild stylization
- everyday or cinematic archetypes
- easy to understand in 1 second

ABSURD options (3–4):
- mascots, toys, animals, cursed humans
- exaggerated proportions or materials
- intentionally awkward or ridiculous

Pose, motion, and framing MUST stay the same.

---

#### OBJECT
You are replacing WHAT the object is.

NORMAL options (1–2):
- believable objects
- realistic materials and scale
- common real-world logic

ABSURD options (3–4):
- living or semi-living objects
- impossible materials
- ironic luxury or exaggerated scale

Object position and usage MUST stay unchanged.

---

#### BACKGROUND
You are replacing WHERE the scene happens.

NORMAL options (1–2):
- realistic locations
- coherent lighting and perspective
- everyday or cinematic environments

ABSURD options (3–4):
- surreal but readable locations
- awkward or ironic places
- exaggerated environments that still keep composition

Camera angle and composition MUST stay unchanged.

---

### OUTPUT STRUCTURE (STRICT)

For EACH element:

{
  "id": "<same element id>",
  "type": "<same type>",
  "remixOptions": [
    {
      "id": "opt-1",
      "mode": "normal",
      "label": "2–3 words",
      "icon": "single emoji",
      "prompt": "Concrete, clear replacement description"
    },
    {
      "id": "opt-2",
      "mode": "normal",
      "label": "...",
      "icon": "...",
      "prompt": "..."
    },
    {
      "id": "opt-3",
      "mode": "absurd",
      "label": "...",
      "icon": "...",
      "prompt": "Cringe, absurd, over-the-top replacement description"
    },
    {
      "id": "opt-4",
      "mode": "absurd",
      "label": "...",
      "icon": "...",
      "prompt": "Cringe, absurd, over-the-top replacement description"
    }
  ]
}

---

### ABSOLUTE RULES

- EXACTLY 4 options per element
- STRICT order: normal, normal, absurd, absurd
- No abstract or poetic language
- No new elements
- Each option must clearly REPLACE the original element
- Each option must be instantly visual

Return ONLY valid JSON array.
`;

const JSON_REGEX = /\[[\s\S]*\]/;

export class OpenAIService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Генерирует remix-варианты для элементов через ChatGPT
   * @param elements Элементы без вариантов (от Gemini анализа)
   * @returns Элементы с сгенерированными вариантами
   */
  async generateEnchantingOptions(
    elements: ElementWithoutOptions[]
  ): Promise<EnchantingResult[]> {
    if (elements.length === 0) {
      return [];
    }

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

    const response = await this.client.chat.completions.create({
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
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from ChatGPT");
    }

    const jsonMatch = content.match(JSON_REGEX);
    if (!jsonMatch) {
      throw new Error("Failed to parse ChatGPT response as JSON array");
    }

    const results = JSON.parse(jsonMatch[0]) as EnchantingResult[];

    // Валидация результатов
    for (const result of results) {
      if (!(result.id && result.type && result.remixOptions)) {
        throw new Error(`Invalid result structure for element ${result.id}`);
      }
      if (result.remixOptions.length !== 4) {
        throw new Error(
          `Expected 4 options for element ${result.id}, got ${result.remixOptions.length}`
        );
      }
    }

    return results;
  }
}

let openaiServiceInstance: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
  if (!openaiServiceInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openaiServiceInstance = new OpenAIService(apiKey);
  }
  return openaiServiceInstance;
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
