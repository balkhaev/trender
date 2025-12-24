/**
 * Централизованные ключи для React Query
 */
import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  // Reels
  reels: ["reels"] as const,
  reelStats: ["reelStats"] as const,
  reelById: (id: string) => ["reel", id] as const,
  reelDebug: (id: string) => ["reel-debug", id] as const,

  // Templates
  templates: ["templates"] as const,
  templateById: (id: string) => ["template", id] as const,
  templateGenerations: (id: string) => ["template-generations", id] as const,

  // Feed
  feed: ["feed"] as const,
  searchTemplates: ["search-templates"] as const,

  // Saved
  savedReels: ["saved-reels"] as const,

  // Jobs
  jobs: ["jobs"] as const,
  jobById: (id: string) => ["job", id] as const,

  // Queues
  queues: ["queues"] as const,
} as const;

/**
 * Инвалидирует все запросы связанные с рилами
 */
export function invalidateReelRelated(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.reels });
  queryClient.invalidateQueries({ queryKey: queryKeys.reelStats });
}

/**
 * Инвалидирует запросы после анализа (reels + templates)
 */
export function invalidateAfterAnalysis(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.reels });
  queryClient.invalidateQueries({ queryKey: queryKeys.reelStats });
  queryClient.invalidateQueries({ queryKey: queryKeys.templates });
}

/**
 * Инвалидирует запросы после удаления
 */
export function invalidateAfterDelete(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.reels });
  queryClient.invalidateQueries({ queryKey: queryKeys.reelStats });
  queryClient.invalidateQueries({ queryKey: queryKeys.templates });
}

/**
 * Инвалидирует запросы связанные с шаблонами
 */
export function invalidateTemplateRelated(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.templates });
  queryClient.invalidateQueries({ queryKey: queryKeys.feed });
  queryClient.invalidateQueries({ queryKey: queryKeys.searchTemplates });
}
