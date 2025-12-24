/**
 * Prompt Builder Utility
 * Shared function for building prompts from element selections
 */

export type Element = {
  id: string;
  type: string;
  label: string;
  description: string;
  /** Позиция в кадре: "center-left foreground", "right side background" */
  position?: string;
  /** Уникальные черты для идентификации: "bright red color, low silhouette" */
  distinguishingFeatures?: string;
  remixOptions: Array<{ id: string; label: string; prompt: string }>;
};

export type ElementSelection = {
  elementId: string;
  selectedOptionId?: string;
  customMediaUrl?: string;
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

    // Check for custom image first (selectedOptionId === "custom" or has customMediaUrl)
    if (
      selection.selectedOptionId === "custom" ||
      (!selection.selectedOptionId && selection.customMediaUrl)
    ) {
      if (selection.customMediaUrl) {
        // User provided custom image - add to image_list and reference in prompt
        imageUrls.push(selection.customMediaUrl);
        const imageIndex = imageUrls.length; // 1-based index for Kling

        // Строим точное описание цели для замены
        const targetDesc = element.description
          ? `${element.label} (${element.description})`
          : element.label;
        const positionHint = element.position
          ? ` located ${element.position}`
          : "";

        let replacePrompt = `Replace ONLY the ${targetDesc}${positionHint} with the reference from <<<image_${imageIndex}>>>. CRITICAL: maintain exact position, scale, angle, orientation, and perspective. Preserve realistic physics - the replacement must interact naturally with the environment (ground, roads, surrounding objects). Match the original object's trajectory and movement`;

        // Добавляем защиту других объектов
        if (unchangedLabels.length > 0) {
          replacePrompt += `. Keep unchanged: ${unchangedLabels.join(", ")}`;
        }

        parts.push(replacePrompt);
      }
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

  // Негативный промпт для защиты элементов и физики
  const physicsNegative =
    "floating objects, objects clipping through surfaces, unrealistic angles, wrong perspective, broken physics, objects going through walls or ground";
  const negativePrompt =
    unchangedLabels.length > 0
      ? `modifying ${unchangedLabels.join(", ")}, changing unselected objects, altering protected elements, ${physicsNegative}`
      : physicsNegative;

  return {
    prompt: parts.join(". "),
    imageUrls,
    negativePrompt,
  };
}
