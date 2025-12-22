import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeReel,
  analyzeReelByFrames,
  analyzeReelEnchanting,
  downloadReel,
  generateFromTemplate,
  generateVideo,
  getCategories,
  getReelDebug,
  getReelLogs,
  getTags,
  getTemplate,
  getTemplateGenerations,
  getTemplates,
  type KlingGenerationOptions,
  processReel,
  type ReelDebugInfo,
  type TemplateAnalysis,
  type TemplateParams,
  updateAnalysis,
  updateTemplate,
  type VideoGeneration,
} from "../templates-api";

// Templates list
export function useTemplates(params: TemplateParams = {}) {
  return useQuery({
    queryKey: ["templates", params],
    queryFn: () => getTemplates(params),
  });
}

// Single template
export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: ["template", id],
    queryFn: () => (id ? getTemplate(id) : null),
    enabled: !!id,
  });
}

// Update template
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        tags?: string[];
        category?: string;
        isPublished?: boolean;
      };
    }) => updateTemplate(id, data),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template", template.id] });
    },
  });
}

// Generate from template (Kling)
export function useGenerateFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      customPrompt,
      options,
    }: {
      templateId: string;
      customPrompt?: string;
      options?: KlingGenerationOptions;
    }) => generateFromTemplate(templateId, customPrompt, options),
    onSuccess: (_, { templateId }) => {
      // Invalidate template generations
      queryClient.invalidateQueries({
        queryKey: ["template-generations", templateId],
      });
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
    },
  });
}

// Generate video (Kling video-to-video)
export function useGenerateVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      analysisId,
      prompt,
      sourceVideoUrl,
      options,
    }: {
      analysisId: string;
      prompt: string;
      sourceVideoUrl: string;
      options?: KlingGenerationOptions;
    }) => generateVideo(analysisId, prompt, sourceVideoUrl, options),
    onSuccess: (_, { analysisId }) => {
      queryClient.invalidateQueries({
        queryKey: ["reel-debug"],
      });
      queryClient.invalidateQueries({ queryKey: ["analysis", analysisId] });
    },
  });
}

// Update analysis (Pro mode editing)
export function useUpdateAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      analysisId,
      data,
    }: {
      analysisId: string;
      data: Partial<Omit<TemplateAnalysis, "id">>;
    }) => updateAnalysis(analysisId, data),
    onSuccess: (_, { analysisId }) => {
      queryClient.invalidateQueries({ queryKey: ["analysis", analysisId] });
      queryClient.invalidateQueries({ queryKey: ["reel-debug"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

// Template generations
export function useTemplateGenerations(templateId: string | null) {
  return useQuery({
    queryKey: ["template-generations", templateId],
    queryFn: () => (templateId ? getTemplateGenerations(templateId) : []),
    enabled: !!templateId,
    refetchInterval: (query) => {
      // Poll if there are pending generations
      const data = query.state.data as VideoGeneration[] | undefined;
      const hasPending = data?.some(
        (g) => g.status === "pending" || g.status === "processing"
      );
      return hasPending ? 3000 : false;
    },
  });
}

// Categories
export function useCategories() {
  return useQuery({
    queryKey: ["template-categories"],
    queryFn: getCategories,
    staleTime: 60_000, // Cache for 1 minute
  });
}

// Tags
export function useTags() {
  return useQuery({
    queryKey: ["template-tags"],
    queryFn: getTags,
    staleTime: 60_000, // Cache for 1 minute
  });
}

// Reel Debug
export function useReelDebug(reelId: string | null) {
  return useQuery({
    queryKey: ["reel-debug", reelId],
    queryFn: () => (reelId ? getReelDebug(reelId) : null),
    enabled: !!reelId,
    refetchInterval: (query) => {
      // Poll if reel is being processed
      const data = query.state.data as ReelDebugInfo | null | undefined;
      const status = data?.reel?.status;
      const isProcessing = status === "downloading" || status === "analyzing";
      return isProcessing ? 2000 : false;
    },
  });
}

// Reel Logs
export function useReelLogs(reelId: string | null, stage?: string) {
  return useQuery({
    queryKey: ["reel-logs", reelId, stage],
    queryFn: () => (reelId ? getReelLogs(reelId, stage) : []),
    enabled: !!reelId,
  });
}

// Process Reel
export function useProcessReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reelId,
      options,
    }: {
      reelId: string;
      options?: {
        skipDownload?: boolean;
        skipAnalysis?: boolean;
        forceReprocess?: boolean;
      };
    }) => processReel(reelId, options),
    onSuccess: (_, { reelId }) => {
      queryClient.invalidateQueries({ queryKey: ["reel-debug", reelId] });
      queryClient.invalidateQueries({ queryKey: ["saved-reels"] });
    },
  });
}

// Download Reel
export function useDownloadReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reelId: string) => downloadReel(reelId),
    onSuccess: (_, reelId) => {
      queryClient.invalidateQueries({ queryKey: ["reel-debug", reelId] });
      queryClient.invalidateQueries({ queryKey: ["saved-reels"] });
    },
  });
}

// Analyze Reel
export function useAnalyzeReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reelId: string) => analyzeReel(reelId),
    onSuccess: (_, reelId) => {
      queryClient.invalidateQueries({ queryKey: ["reel-debug", reelId] });
      queryClient.invalidateQueries({ queryKey: ["saved-reels"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

// Analyze Reel by Frames
export function useAnalyzeReelByFrames() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reelId: string) => analyzeReelByFrames(reelId),
    onSuccess: (_, reelId) => {
      queryClient.invalidateQueries({ queryKey: ["reel-debug", reelId] });
      queryClient.invalidateQueries({ queryKey: ["saved-reels"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

// Analyze Reel Enchanting (Gemini + ChatGPT)
export function useAnalyzeReelEnchanting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reelId: string) => analyzeReelEnchanting(reelId),
    onSuccess: (_, reelId) => {
      queryClient.invalidateQueries({ queryKey: ["reel-debug", reelId] });
      queryClient.invalidateQueries({ queryKey: ["saved-reels"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}
