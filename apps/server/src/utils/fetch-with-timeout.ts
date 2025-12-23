/**
 * Fetch with timeout wrapper
 * Предотвращает бесконечное ожидание при недоступности внешних сервисов
 */

export class FetchTimeoutError extends Error {
  constructor(
    public url: string,
    public timeoutMs: number
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

/**
 * Выполняет fetch с таймаутом
 * @param url - URL для запроса
 * @param options - стандартные RequestInit опции
 * @param timeoutMs - таймаут в миллисекундах (по умолчанию 30 секунд)
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Таймауты по умолчанию для разных операций (в мс)
 */
export const FETCH_TIMEOUTS = {
  metadata: 60_000, // 1 минута для метаданных
  download: 120_000, // 2 минуты для скачивания видео
  trim: 180_000, // 3 минуты для trim операции
  concat: 300_000, // 5 минут для concat операции
  api: 30_000, // 30 секунд для обычных API вызовов
} as const;
