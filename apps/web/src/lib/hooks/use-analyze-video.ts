import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type AnalyzeDownloadedRequest,
  type AnalyzeReelRequest,
  type AnalyzeVideoResult,
  analyzeDownloadedVideo,
  analyzeReelByUrl,
  analyzeVideo,
  type GenerateVideoRequest,
  generateVideo,
  getGenerationLogs,
  getGenerationStatus,
  getPipelineStatus,
  getReel,
  listAnalyses,
  listGenerations,
  type PipelineGenerateResponse,
  type PipelineStatusResponse,
  type Reel,
  startPipelineGeneration,
  type VideoGeneration,
} from "../api";

export function useAnalyzeVideo() {
  return useMutation<AnalyzeVideoResult, Error, File>({
    mutationFn: analyzeVideo,
  });
}

export function useAnalyzeDownloadedVideo() {
  return useMutation<AnalyzeVideoResult, Error, AnalyzeDownloadedRequest>({
    mutationFn: analyzeDownloadedVideo,
  });
}

export function useAnalyzeReelById() {
  return useMutation<AnalyzeVideoResult, Error, AnalyzeReelRequest>({
    mutationFn: analyzeReelByUrl,
  });
}

export function useGenerateVideo() {
  return useMutation<string, Error, GenerateVideoRequest>({
    mutationFn: generateVideo,
  });
}

export function useGenerationStatus(generationId: string | null) {
  return useQuery<VideoGeneration, Error>({
    queryKey: ["generation", generationId],
    queryFn: () => {
      if (!generationId) {
        throw new Error("Generation ID is required");
      }
      return getGenerationStatus(generationId);
    },
    enabled: !!generationId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling when completed or failed
      if (data?.status === "completed" || data?.status === "failed") {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });
}

export function useAnalysesList(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["analyses", limit, offset],
    queryFn: () => listAnalyses(limit, offset),
  });
}

export function useGenerationsList(limit = 50, offset = 0, status?: string) {
  return useQuery({
    queryKey: ["generations", limit, offset, status],
    queryFn: () => listGenerations(limit, offset, status),
  });
}

/**
 * Hook для polling прогресса рила с возможностью получения логов
 */
export function useReelProgress(reelId: string | null, includeLogs = false) {
  return useQuery<Reel, Error>({
    queryKey: ["reel", reelId, includeLogs],
    queryFn: () => {
      if (!reelId) {
        throw new Error("Reel ID is required");
      }
      return getReel(reelId, includeLogs);
    },
    enabled: !!reelId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Прекращаем polling если статус финальный
      if (
        data?.status === "analyzed" ||
        data?.status === "failed" ||
        data?.status === "scraped"
      ) {
        return false;
      }
      return 2000; // Poll every 2 seconds for active statuses
    },
  });
}

/**
 * Hook для получения логов генерации
 */
export function useGenerationLogs(generationId: string | null) {
  return useQuery({
    queryKey: ["generationLogs", generationId],
    queryFn: () => {
      if (!generationId) {
        throw new Error("Generation ID is required");
      }
      return getGenerationLogs(generationId);
    },
    enabled: !!generationId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Прекращаем polling если статус финальный
      if (
        data?.generation?.status === "completed" ||
        data?.generation?.status === "failed"
      ) {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });
}

// ============================================
// PIPELINE GENERATION HOOKS
// ============================================

/**
 * Hook для запуска async pipeline генерации
 */
export function useStartPipelineGeneration() {
  return useMutation<
    PipelineGenerateResponse,
    Error,
    { url: string; forceReprocess?: boolean }
  >({
    mutationFn: ({ url, forceReprocess }) =>
      startPipelineGeneration(url, forceReprocess),
  });
}

/**
 * Hook для polling статуса pipeline генерации
 * Возвращает progress, analysis и template когда готово
 */
export function usePipelineStatus(reelId: string | null) {
  return useQuery<PipelineStatusResponse, Error>({
    queryKey: ["pipelineStatus", reelId],
    queryFn: () => {
      if (!reelId) {
        throw new Error("Reel ID is required");
      }
      return getPipelineStatus(reelId);
    },
    enabled: !!reelId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling when completed or failed
      if (data?.status === "analyzed" || data?.status === "failed") {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });
}
