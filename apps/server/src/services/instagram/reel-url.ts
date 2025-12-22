/**
 * Regex для извлечения shortcode из Instagram URL.
 * Поддерживает:
 * - /reel/ABC123
 * - /reels/ABC123
 * - /p/ABC123
 */
const INSTAGRAM_URL_REGEX =
  /(?:instagram\.com|www\.instagram\.com)\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/;

/**
 * Извлекает shortcode из URL Instagram рилса или поста.
 *
 * @param url - URL рилса (например https://www.instagram.com/reel/ABC123/)
 * @returns shortcode или null если URL невалидный
 *
 * @example
 * parseReelUrl("https://www.instagram.com/reel/ABC123/") // "ABC123"
 * parseReelUrl("https://instagram.com/p/XYZ789/?igsh=abc") // "XYZ789"
 * parseReelUrl("https://google.com/reel/ABC") // null
 */
export function parseReelUrl(url: string): string | null {
  if (!url || url.trim().length === 0) {
    return null;
  }

  const match = url.match(INSTAGRAM_URL_REGEX);
  if (!match?.[1]) {
    return null;
  }

  const shortcode = match[1];

  // Минимальная длина shortcode в Instagram - 4 символа
  if (shortcode.length < 4) {
    return null;
  }

  return shortcode;
}

/**
 * Проверяет, является ли URL валидным Instagram URL.
 */
export function isInstagramUrl(url: string): boolean {
  return parseReelUrl(url) !== null;
}
