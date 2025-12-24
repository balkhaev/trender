/**
 * Prompt Builder Utility
 * Shared function for building prompts from element selections
 */

export type Element = {
  id: string;
  type: string;
  label: string;
  description: string | null;
  /** Позиция в кадре: "center-left foreground", "right side background" */
  position?: string;
  /** Уникальные черты для идентификации: "bright red color, low silhouette" */
  distinguishingFeatures?: string;
  /** Взаимодействие с окружением: "50% inserted into pipe from right", "resting on table" */
  environmentInteractions?: string;
  /** Процент видимой части объекта: 50 = половина скрыта */
  visibilityPercent?: number;
  /** Точки контакта с поверхностями: "rear wheels on ground, front inside pipe" */
  contactPoints?: string;
  /** Что скрывает объект: "front half hidden by pipe, Santa on top" */
  occlusionInfo?: string;
  remixOptions: Array<{ id: string; label: string; prompt: string }>;
};

export type ElementSelection = {
  elementId: string;
  selectedOptionId?: string;
  customMediaUrl?: string;
  customPrompt?: string;
};

/**
 * Build prompt from selections for Kling API
 * Returns prompt with <<<image_N>>> references, image URLs, and negative prompt
 *
 * Kling API uses:
 * - <<<video_1>>> for source video reference
 * - <<<image_1>>>, <<<image_2>>>... for image references
 * - image_list[] array with URLs in corresponding order
 * - negative_prompt to protect unselected elements
 */
export function buildPromptFromSelections(
  elements: Element[],
  selections: ElementSelection[]
): { prompt: string; imageUrls: string[]; negativePrompt?: string } {
  const parts: string[] = [];
  const imageUrls: string[] = [];

  // Определяем какие элементы НЕ выбраны для замены
  const selectedIds = new Set(selections.map((s) => s.elementId));
  const unchangedElements = elements.filter((e) => !selectedIds.has(e.id));
  const unchangedLabels = unchangedElements.map((e) => e.label);

  for (const selection of selections) {
    const element = elements.find((e) => e.id === selection.elementId);
    if (!element) continue;

    // Check for custom option (image or text prompt)
    if (
      selection.selectedOptionId === "custom" ||
      (!selection.selectedOptionId &&
        (selection.customMediaUrl || selection.customPrompt))
    ) {
      // Строим точное описание цели для замены
      const targetDesc = element.description
        ? `${element.label} (${element.description})`
        : element.label;

      // Собираем контекст позиции и взаимодействия
      const contextParts: string[] = [];
      if (element.position) {
        contextParts.push(`located ${element.position}`);
      }
      if (element.environmentInteractions) {
        contextParts.push(element.environmentInteractions);
      }
      if (element.visibilityPercent !== undefined) {
        contextParts.push(`${element.visibilityPercent}% visible`);
      }
      if (element.contactPoints) {
        contextParts.push(`contact: ${element.contactPoints}`);
      }

      const contextHint =
        contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";

      let replacePrompt: string;

      if (selection.customMediaUrl) {
        // User provided custom image - add to imageList and reference in prompt
        imageUrls.push(selection.customMediaUrl);
        const imageIndex = imageUrls.length; // 1-based index for Kling
        replacePrompt = `Replace ONLY the ${targetDesc}${contextHint} with the reference from <<<image_${imageIndex}>>>`;
      } else if (selection.customPrompt) {
        // User provided custom text prompt
        replacePrompt = `Replace ONLY the ${targetDesc}${contextHint} with: ${selection.customPrompt}`;
      } else {
        continue; // No custom data provided
      }

      // КРИТИЧЕСКИ ВАЖНО: инструкции по сохранению взаимодействий
      const preserveInstructions: string[] = [];

      if (element.environmentInteractions) {
        preserveInstructions.push(
          `PRESERVE EXACT ENVIRONMENT INTERACTION: ${element.environmentInteractions}`
        );
      }

      if (element.visibilityPercent !== undefined) {
        preserveInstructions.push(
          `maintain ${element.visibilityPercent}% visibility (same occlusion as original)`
        );
      }

      if (element.contactPoints) {
        preserveInstructions.push(
          `keep contact points: ${element.contactPoints}`
        );
      }

      if (element.occlusionInfo) {
        preserveInstructions.push(
          `preserve occlusion: ${element.occlusionInfo}`
        );
      }

      // Базовые инструкции физики
      preserveInstructions.push(
        "maintain exact position, scale, angle, orientation, perspective",
        "replacement must have IDENTICAL spatial relationship with environment as original"
      );

      replacePrompt += `. CRITICAL: ${preserveInstructions.join(". ")}`;

      // Добавляем защиту других объектов
      if (unchangedLabels.length > 0) {
        replacePrompt += `. Keep unchanged: ${unchangedLabels.join(", ")}`;
      }

      parts.push(replacePrompt);
    } else if (selection.selectedOptionId) {
      // User selected a predefined option
      const option = element.remixOptions.find(
        (o) => o.id === selection.selectedOptionId
      );
      if (option) {
        // Для preset опций тоже добавляем защиту других объектов
        let optionPrompt = option.prompt;
        if (unchangedLabels.length > 0) {
          optionPrompt += `. Keep unchanged: ${unchangedLabels.join(", ")}`;
        }
        parts.push(optionPrompt);
      }
    }
  }

  // Негативный промпт для защиты элементов, физики и взаимодействий
  const physicsNegative =
    "floating objects, objects clipping through surfaces, unrealistic angles, wrong perspective, broken physics, objects going through walls or ground";
  const interactionNegative =
    "changing environment interactions, removing object embedding, exposing hidden parts, changing visibility percentage, breaking contact with surfaces, pulling object out of where it was inserted";
  const negativePrompt =
    unchangedLabels.length > 0
      ? `modifying ${unchangedLabels.join(", ")}, changing unselected objects, altering protected elements, ${physicsNegative}, ${interactionNegative}`
      : `${physicsNegative}, ${interactionNegative}`;

  return {
    prompt: parts.join(". "),
    imageUrls,
    negativePrompt,
  };
}
