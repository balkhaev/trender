import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAuthStatus,
  getDownloads,
  getJobStatus,
  getJobs,
  getSavedReel,
  getSavedReels,
  launchLoginBrowser,
  type SavedReelsParams,
  type ScrapeRequest,
  type ScrapeResponse,
  startScrape,
  uploadCookies,
} from "../reels-api";

export function useStartScrape() {
  const queryClient = useQueryClient();

  return useMutation<ScrapeResponse, Error, ScrapeRequest>({
    mutationFn: startScrape,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useJobStatus(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => {
      if (!jobId) {
        throw new Error("Job ID is required");
      }
      return getJobStatus(jobId);
    },
    enabled: enabled && jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
        return false;
      }
      return 2000;
    },
  });
}

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: 5000,
  });
}

export function useDownloads() {
  return useQuery({
    queryKey: ["downloads"],
    queryFn: getDownloads,
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ["authStatus"],
    queryFn: getAuthStatus,
  });
}

export function useUploadCookies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadCookies,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authStatus"] });
    },
  });
}

export function useLaunchLogin() {
  return useMutation({
    mutationFn: launchLoginBrowser,
  });
}

export function useSavedReels(params: SavedReelsParams = {}) {
  return useQuery({
    queryKey: ["savedReels", params],
    queryFn: () => getSavedReels(params),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSavedReel(id: string | null) {
  return useQuery({
    queryKey: ["savedReel", id],
    queryFn: () => {
      if (!id) {
        throw new Error("ID is required");
      }
      return getSavedReel(id);
    },
    enabled: id !== null,
  });
}
