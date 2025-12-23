/**
 * Prompt Builder Utility
 * Shared function for building prompts from element selections
 */

export type Element = {
  id: string;
  type: string;
  label: string;
  description: string;
  remixOptions: Array<{ id: string; label: string; prompt: string }>;
};

export type ElementSelection = {
  elementId: string;
  selectedOptionId?: string;
  customMediaUrl?: string;
};

/**
 * Build prompt from selections for Kling API
 * Returns prompt with <<<image_N>>> references and list of image URLs
 *
 * Kling API uses:
 * - <<<video_1>>> for source video reference
 * - <<<image_1>>>, <<<image_2>>>... for image references
 * - image_list[] array with URLs in corresponding order
 */
export function buildPromptFromSelections(
  elements: Element[],
  selections: ElementSelection[]
): { prompt: string; imageUrls: string[] } {
  const parts: string[] = [];
  const imageUrls: string[] = [];

  for (const selection of selections) {
    const element = elements.find((e) => e.id === selection.elementId);
    if (!element) continue;

    if (selection.selectedOptionId) {
      // User selected a predefined option
      const option = element.remixOptions.find(
        (o) => o.id === selection.selectedOptionId
      );
      if (option) {
        parts.push(option.prompt);
      }
    } else if (selection.customMediaUrl) {
      // User provided custom image - add to image_list and reference in prompt
      imageUrls.push(selection.customMediaUrl);
      const imageIndex = imageUrls.length; // 1-based index for Kling
      parts.push(
        `Replace ${element.label} with the reference from <<<image_${imageIndex}>>>`
      );
    }
  }

  return {
    prompt: parts.join(". "),
    imageUrls,
  };
}
