import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AddReelRequest,
  type AuthStatus,
  addReelByUrl,
  type BatchAnalyzeRequest,
  batchAnalyzeReels,
  batchRefreshDuration,
  deleteAllReels,
  deleteReel,
  getAuthStatus,
  getJobs,
  getReelStats,
  getSavedReels,
  type JobListItem,
  type ReelStats,
  type ReelStatus,
  type SavedReelsResponse,
  type ScrapeRequest,
  startScrape,
  uploadCookies,
  uploadPipelineVideo,
} from "../reels-api";

export function useReelStats() {
  return useQuery<ReelStats>({
    queryKey: ["reelStats"],
    queryFn: getReelStats,
    refetchInterval: 5000,
  });
}

export function useReelsByStatus(status?: ReelStatus, limit = 50) {
  return useQuery<SavedReelsResponse>({
    queryKey: ["reels", "byStatus", status, limit],
    queryFn: () => getSavedReels({ status, limit }),
    refetchInterval: 5000,
  });
}

export function useAllReels(limit = 100, search?: string) {
  return useQuery<SavedReelsResponse>({
    queryKey: ["reels", "all", limit, search],
    queryFn: () => getSavedReels({ limit, search }),
    refetchInterval: 5000,
  });
}

export function useScrapeJobs() {
  return useQuery<JobListItem[]>({
    queryKey: ["scrapeJobs"],
    queryFn: getJobs,
    refetchInterval: 2000,
  });
}

export function useStartScrape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ScrapeRequest) => startScrape(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapeJobs"] });
    },
  });
}

export function useProcessReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reelId: string) => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/reels/${reelId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to process reel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}

export function useDownloadReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reelId: string) => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/reels/${reelId}/download`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to download reel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}

export function useAnalyzeReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reelId: string) => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${API_URL}/api/reels/${reelId}/analyze`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to analyze reel");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useAnalyzeReelByFrames() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reelId: string) => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(
        `${API_URL}/api/reels/${reelId}/analyze-frames`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to analyze reel by frames");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

// Instagram Auth hooks
export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ["authStatus"],
    queryFn: getAuthStatus,
    refetchInterval: 10_000,
  });
}

export function useUploadCookies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cookies: object[]) => uploadCookies(cookies),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authStatus"] });
    },
  });
}

export function useAddReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AddReelRequest) => addReelByUrl(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}

export function useUploadPipelineVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadPipelineVideo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}

export function useDeleteReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reelId: string) => deleteReel(reelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useDeleteAllReels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAllReels(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useBatchAnalyze() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BatchAnalyzeRequest) => batchAnalyzeReels(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useBatchRefreshDuration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => batchRefreshDuration(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}

export function useBatchResizeAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

      // Получаем все рилы с видео
      const reelsResponse = await fetch(
        `${API_URL}/api/reels/saved?limit=100`,
        {
          credentials: "include",
        }
      );

      if (!reelsResponse.ok) {
        throw new Error("Failed to get reels");
      }

      const data = await reelsResponse.json();
      const reelIds = data.reels
        .filter(
          (r: { localPath: string | null; s3Key: string | null }) =>
            r.localPath || r.s3Key
        )
        .map((r: { id: string }) => r.id);

      if (reelIds.length === 0) {
        return { processed: 0, resized: 0, failed: 0, alreadyValid: 0 };
      }

      // Отправляем на батч-ресайз
      const resizeResponse = await fetch(`${API_URL}/api/reels/batch-resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelIds }),
        credentials: "include",
      });

      if (!resizeResponse.ok) {
        throw new Error("Failed to batch resize");
      }

      return resizeResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["reelStats"] });
    },
  });
}
