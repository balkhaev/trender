/**
 * Remix Prompt Builder
 * Generates Kling AI prompts with only the differences from the original analysis
 */

import type { TemplateAnalysis } from "./templates-api";

/**
 * Image reference for remix generation
 */
export type ImageReference = {
  /** Field this image applies to (e.g., 'subject', 'environment') */
  field: string;
  /** URL of the uploaded image */
  imageUrl: string;
  /** Type of reference: 'image' for style/background, 'element' for subjects/characters */
  type: "image" | "element";
  /** Optional description override */
  description?: string;
};

/**
 * Modifications to the original analysis
 */
export type RemixModifications = Partial<{
  subject: string;
  action: string;
  environment: string;
  cameraStyle: string;
  mood: string;
  colorPalette: string;
  style: string;
  lighting: string;
}>;

/**
 * Fields that can be edited in remix mode
 */
export const EDITABLE_FIELDS = [
  {
    key: "subject",
    label: "Субъект",
    supportsImage: true,
    imageType: "element" as const,
  },
  { key: "action", label: "Действие", supportsImage: false },
  {
    key: "environment",
    label: "Окружение",
    supportsImage: true,
    imageType: "image" as const,
  },
  { key: "cameraStyle", label: "Стиль камеры", supportsImage: false },
  { key: "mood", label: "Настроение", supportsImage: false },
  {
    key: "colorPalette",
    label: "Цветовая гамма",
    supportsImage: true,
    imageType: "image" as const,
  },
  {
    key: "style",
    label: "Визуальный стиль",
    supportsImage: true,
    imageType: "image" as const,
  },
  {
    key: "lighting",
    label: "Освещение",
    supportsImage: true,
    imageType: "image" as const,
  },
] as const;

/**
 * Fields to preserve when not explicitly changed
 */
const PRESERVABLE_FIELDS = [
  "cameraStyle",
  "colorPalette",
  "lighting",
  "pacing",
] as const;

/**
 * Human-readable field names for prompts
 */
const FIELD_NAMES: Record<string, string> = {
  subject: "subject",
  action: "action",
  environment: "environment/location",
  cameraStyle: "camera style",
  mood: "mood/atmosphere",
  colorPalette: "color palette",
  style: "visual style",
  lighting: "lighting",
  pacing: "pacing",
};

type IndicesState = { image: number; element: number };

/**
 * Build change instruction for a single field with image reference
 */
function buildImageRefInstruction(
  fieldName: string,
  newValue: string | undefined,
  imageRef: ImageReference,
  indices: IndicesState
): { instruction: string; indices: IndicesState } {
  const description = newValue?.trim() || "как на референсном изображении";

  if (imageRef.type === "element") {
    const refName = `@Element${indices.element}`;
    return {
      instruction: `change ${fieldName} to ${refName} (${description})`,
      indices: { ...indices, element: indices.element + 1 },
    };
  }
  const refName = `@Image${indices.image}`;
  return {
    instruction: `apply ${fieldName} from ${refName} (${description})`,
    indices: { ...indices, image: indices.image + 1 },
  };
}

type ModificationContext = {
  original: TemplateAnalysis;
  imageRefs: ImageReference[];
  indices: IndicesState;
};

/**
 * Process a single modification and return change instruction if applicable
 */
function processModification(
  key: string,
  newValue: string,
  context: ModificationContext
): { instruction: string | null; indices: IndicesState } {
  const { original, imageRefs, indices } = context;
  const originalValue = original[key as keyof TemplateAnalysis];
  const originalStr = typeof originalValue === "string" ? originalValue : "";

  // No change needed if values are the same
  if (originalStr === newValue) {
    return { instruction: null, indices };
  }

  const fieldName = FIELD_NAMES[key] || key;
  const imageRef = imageRefs.find((r) => r.field === key);

  if (imageRef) {
    return buildImageRefInstruction(fieldName, newValue, imageRef, indices);
  }

  // Text-only change
  return {
    instruction: `change ${fieldName} to "${newValue}"`,
    indices,
  };
}

type PromptBuildState = {
  changes: string[];
  processedFields: Set<string>;
  indices: IndicesState;
};

/**
 * Process all text modifications
 */
function processTextModifications(
  modifications: RemixModifications,
  original: TemplateAnalysis,
  imageRefs: ImageReference[]
): PromptBuildState {
  const state: PromptBuildState = {
    changes: [],
    processedFields: new Set<string>(),
    indices: { image: 1, element: 1 },
  };

  for (const [key, newValue] of Object.entries(modifications)) {
    if (!newValue?.trim()) {
      continue;
    }

    state.processedFields.add(key);
    const result = processModification(key, newValue, {
      original,
      imageRefs,
      indices: state.indices,
    });
    if (result.instruction) {
      state.changes.push(result.instruction);
    }
    state.indices = result.indices;
  }

  return state;
}

/**
 * Process image references that don't have text modifications
 */
function processImageOnlyRefs(
  imageRefs: ImageReference[],
  state: PromptBuildState
): void {
  for (const imageRef of imageRefs) {
    if (state.processedFields.has(imageRef.field)) {
      continue;
    }

    const fieldName = FIELD_NAMES[imageRef.field] || imageRef.field;
    const result = buildImageRefInstruction(
      fieldName,
      undefined,
      imageRef,
      state.indices
    );
    state.changes.push(result.instruction);
    state.indices = result.indices;
    state.processedFields.add(imageRef.field);
  }
}

/**
 * Determine fields to preserve from original
 */
function getFieldsToKeep(
  original: TemplateAnalysis,
  processedFields: Set<string>
): string[] {
  const keeps: string[] = [];

  for (const field of PRESERVABLE_FIELDS) {
    if (processedFields.has(field)) {
      continue;
    }

    const originalValue = original[field as keyof TemplateAnalysis];
    if (
      originalValue &&
      typeof originalValue === "string" &&
      originalValue.trim()
    ) {
      keeps.push(FIELD_NAMES[field] || field);
    }
  }

  return keeps;
}

/**
 * Build a diff-based prompt for Kling AI video-to-video generation
 *
 * @param original - Original analysis from the source reel
 * @param modifications - User's modifications (only changed fields)
 * @param imageRefs - Image references to include in the prompt
 * @returns Kling-compatible prompt string
 */
export function buildDiffPrompt(
  original: TemplateAnalysis,
  modifications: RemixModifications,
  imageRefs: ImageReference[] = []
): string {
  // Process text modifications first
  const state = processTextModifications(modifications, original, imageRefs);

  // Process image-only references
  processImageOnlyRefs(imageRefs, state);

  // Get fields to keep
  const keeps = getFieldsToKeep(original, state.processedFields);

  // Build final prompt
  let prompt = "Based on @Video1";

  if (state.changes.length > 0) {
    prompt = `${prompt}, ${state.changes.join(", ")}`;
  }

  if (keeps.length > 0) {
    prompt = `${prompt}. Keep the ${keeps.join(", ")}`;
  }

  return `${prompt}.`;
}

/**
 * Extract image URLs and elements for Kling API request
 *
 * @param imageRefs - Image references from the remix editor
 * @returns Object with imageUrls and elements arrays for Kling API
 */
export function extractKlingImageInputs(imageRefs: ImageReference[]): {
  imageUrls: string[];
  elements: { referenceImageUrls: string[]; frontalImageUrl?: string }[];
} {
  const imageUrls: string[] = [];
  const elements: { referenceImageUrls: string[]; frontalImageUrl?: string }[] =
    [];

  for (const ref of imageRefs) {
    if (ref.type === "image") {
      imageUrls.push(ref.imageUrl);
    } else {
      // Element type - used for subject/character references
      elements.push({
        referenceImageUrls: [ref.imageUrl],
        frontalImageUrl: ref.imageUrl,
      });
    }
  }

  return { imageUrls, elements };
}

/**
 * Count how many fields have been modified
 */
export function countModifications(modifications: RemixModifications): number {
  return Object.values(modifications).filter((v) => v?.trim()).length;
}

/**
 * Check if any modifications have been made
 */
export function hasModifications(modifications: RemixModifications): boolean {
  return countModifications(modifications) > 0;
}

/**
 * Check if there are any image references
 */
export function hasImageReferences(imageRefs: ImageReference[]): boolean {
  return imageRefs.length > 0;
}

/**
 * Check if generation can proceed (either has modifications or has image references)
 */
export function canGenerate(
  modifications: RemixModifications,
  imageRefs: ImageReference[]
): boolean {
  return hasModifications(modifications) || hasImageReferences(imageRefs);
}

/**
 * Get default description for an image reference based on type
 */
export function getDefaultImageDescription(
  imageType: "image" | "element"
): string {
  if (imageType === "element") {
    return "как на референсном изображении";
  }
  return "в стиле референсного изображения";
}

/**
 * Get a preview of what will be changed
 */
export function getModificationsSummary(
  original: TemplateAnalysis,
  modifications: RemixModifications
): { field: string; from: string; to: string }[] {
  const summary: { field: string; from: string; to: string }[] = [];

  for (const [key, newValue] of Object.entries(modifications)) {
    if (!newValue?.trim()) {
      continue;
    }

    const originalValue = original[key as keyof TemplateAnalysis];
    const originalStr = typeof originalValue === "string" ? originalValue : "";

    if (originalStr !== newValue) {
      const fromText = originalStr.slice(0, 100);
      const toText = newValue.slice(0, 100);
      summary.push({
        field: FIELD_NAMES[key] || key,
        from: originalStr.length > 100 ? `${fromText}...` : fromText,
        to: newValue.length > 100 ? `${toText}...` : toText,
      });
    }
  }

  return summary;
}
