import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AddReelRequest,
  type AuthStatus,
  addReelByUrl,
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

export function useAllReels(limit = 100) {
  return useQuery<SavedReelsResponse>({
    queryKey: ["reels", "all", limit],
    queryFn: () => getSavedReels({ limit }),
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
