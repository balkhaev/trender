import type {
  GeminiRawAnalysis,
  RawAnalysisWithoutOptions,
  VideoAnalysis,
  VideoAnalysisWithoutOptions,
} from "./gemini.types";

export const JSON_REGEX = /\{[\s\S]*\}/;

/**
 * Checks Gemini response for blocking and extracts text
 * @throws Error with clear message if response is blocked
 */
export function extractTextFromResponse(response: {
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
  // Check prompt blocking
  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `Запрос заблокирован Gemini: ${response.promptFeedback.blockReason}. Возможно, видео содержит контент, который модерация считает неприемлемым.`
    );
  }

  // Check response blocking
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
    // If .text() threw an exception, give a clear message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("blocked")) {
      throw new Error(
        "Контент заблокирован модерацией Gemini. Видео может содержать неприемлемый контент. Попробуйте другое видео."
      );
    }
    throw error;
  }
}

export function parseDuration(
  duration: number | string | null | undefined
): number | null {
  return typeof duration === "string"
    ? Number.parseInt(duration, 10) || null
    : (duration ?? null);
}

export function parseRawAnalysis(raw: GeminiRawAnalysis): VideoAnalysis {
  // Limit to 6 elements (take first - most important by AI ranking)
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

export function parseRawAnalysisWithoutOptions(
  raw: RawAnalysisWithoutOptions
): VideoAnalysisWithoutOptions {
  // Limit to 6 elements
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
