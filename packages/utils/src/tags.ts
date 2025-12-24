/**
 * Утилиты для работы с тегами
 */

const HASH_PREFIX_REGEX = /^#+/;
const COLLAPSE_WS_REGEX = /\s+/g;
const KEEP_CHARS_REGEX = /[^\p{L}\p{N}_-]+/gu;
const SPLIT_TAGS_REGEX = /[,\n\r\t;]+/g;

/**
 * Удаляет дубликаты из массива
 */
export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Нормализует один тег: убирает #, пробелы, спецсимволы
 */
export function normalizeOneTag(raw: string): string {
  const trimmed = raw.trim().replace(HASH_PREFIX_REGEX, "");
  if (trimmed.length === 0) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  const collapsed = lower.replace(COLLAPSE_WS_REGEX, "-");
  const cleaned = collapsed.replace(KEEP_CHARS_REGEX, "");

  return cleaned;
}

/**
 * Нормализует массив тегов
 */
export function normalizeTags(input: string[]): string[] {
  const normalized = input.map(normalizeOneTag).filter((t) => t.length > 0);
  return uniq(normalized);
}

/**
 * Парсит строку с тегами (разделители: запятая, перенос строки, табуляция, точка с запятой)
 */
export function parseTagsFromString(input: string): string[] {
  const parts = input.split(SPLIT_TAGS_REGEX);
  return normalizeTags(parts);
}

/**
 * Разбивает тег на токены по - и _
 */
export function tokenizeTag(tag: string): string[] {
  return tag.split(/[-_]+/g).filter((t) => t.length > 0);
}

/**
 * Считает общие токены между двумя тегами
 */
export function countSharedTokens(a: string, b: string): number {
  const aTokens = new Set(tokenizeTag(a));
  const bTokens = tokenizeTag(b);
  let shared = 0;
  for (const token of bTokens) {
    if (aTokens.has(token)) {
      shared += 1;
    }
  }
  return shared;
}
