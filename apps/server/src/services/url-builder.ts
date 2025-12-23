/**
 * Централизованный модуль для формирования публичных URL
 * Все URL для API endpoints формируются здесь с PUBLIC_URL
 */
import { services } from "../config";

// PUBLIC_URL с fallback на localhost для dev окружения
const PUBLIC_URL = services.publicUrl || "http://localhost:3000";

/**
 * Получить базовый публичный URL
 */
export function getPublicBaseUrl(): string {
  return PUBLIC_URL;
}

/**
 * Сформировать полный публичный URL для API пути
 */
export function buildPublicUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_URL}${normalizedPath}`;
}

/**
 * URL для видео рила (S3)
 */
export function getReelVideoPublicUrl(reelId: string): string {
  return buildPublicUrl(`/api/files/reels/${reelId}`);
}

/**
 * URL для локального видео рила (legacy downloads)
 */
export function getReelLocalVideoPublicUrl(
  folder: string,
  reelId: string
): string {
  return buildPublicUrl(`/api/reels/downloads/${folder}/${reelId}.mp4`);
}

/**
 * URL для сгенерированного видео (S3)
 */
export function getGenerationVideoPublicUrl(generationId: string): string {
  return buildPublicUrl(`/api/files/generations/${generationId}`);
}

/**
 * URL для сгенерированного видео (локальный файл)
 */
export function getGenerationLocalVideoPublicUrl(generationId: string): string {
  return buildPublicUrl(`/api/video/generation/${generationId}/download`);
}

/**
 * URL для референсного изображения
 */
export function getReferenceImagePublicUrl(
  imageId: string,
  extension: string
): string {
  return buildPublicUrl(`/api/files/references/${imageId}.${extension}`);
}

/**
 * URL для медиа из библиотеки пользователя
 */
export function getMediaPublicUrl(s3Key: string): string {
  return buildPublicUrl(`/api/files/media/${encodeURIComponent(s3Key)}`);
}

/**
 * Универсальная функция для получения videoUrl рила
 * Выбирает: s3Key -> localPath -> null
 */
export function buildReelVideoUrl(reel: {
  id: string;
  s3Key?: string | null;
  localPath?: string | null;
  hashtag?: string | null;
  source?: string | null;
}): string | null {
  if (reel.s3Key) {
    return getReelVideoPublicUrl(reel.id);
  }

  if (reel.localPath) {
    const folder = reel.hashtag || reel.source || "unknown";
    return getReelLocalVideoPublicUrl(folder, reel.id);
  }

  return null;
}
