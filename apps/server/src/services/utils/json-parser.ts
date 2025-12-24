/**
 * Утилиты для извлечения JSON из текстовых ответов AI
 */

const JSON_OBJECT_REGEX = /\{[\s\S]*\}/;
const JSON_ARRAY_REGEX = /\[[\s\S]*\]/;

export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; rawText: string };

/**
 * Извлекает и парсит JSON объект из текста
 */
export function extractJsonObject<T>(text: string): JsonParseResult<T> {
  const match = text.match(JSON_OBJECT_REGEX);
  if (!match) {
    return { success: false, error: "No JSON object found", rawText: text };
  }
  try {
    return { success: true, data: JSON.parse(match[0]) as T };
  } catch (e) {
    return {
      success: false,
      error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
      rawText: match[0],
    };
  }
}

/**
 * Извлекает и парсит JSON массив из текста
 */
export function extractJsonArray<T>(text: string): JsonParseResult<T[]> {
  const match = text.match(JSON_ARRAY_REGEX);
  if (!match) {
    return { success: false, error: "No JSON array found", rawText: text };
  }
  try {
    return { success: true, data: JSON.parse(match[0]) as T[] };
  } catch (e) {
    return {
      success: false,
      error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
      rawText: match[0],
    };
  }
}

/**
 * Извлекает JSON из текста (пытается сначала объект, потом массив)
 */
export function extractJson<T>(text: string): JsonParseResult<T> {
  // Сначала пробуем объект
  const objectResult = extractJsonObject<T>(text);
  if (objectResult.success) {
    return objectResult;
  }

  // Потом пробуем массив
  const arrayResult = extractJsonArray<T>(text);
  if (arrayResult.success) {
    return arrayResult as JsonParseResult<T>;
  }

  return { success: false, error: "No valid JSON found", rawText: text };
}
