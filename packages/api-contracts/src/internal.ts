/**
 * Internal API Types
 * Admin/debug API contracts: Reels, Analysis, Templates, Pipeline
 */

import { z } from "zod";
import { DetectableElementSchema } from "./public";

// ===== QUERY TYPES =====

export const ListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  category: z.string().optional(),
  tag: z.string().optional(),
  published: z.boolean().optional(),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const ReelStatusSchema = z.enum([
  "scraped",
  "downloading",
  "downloaded",
  "analyzing",
  "analyzed",
  "failed",
]);
export type ReelStatus = z.infer<typeof ReelStatusSchema>;

export const ReelListQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
  minLikes: z.number().int().min(0).optional(),
  hashtag: z.string().optional(),
  status: ReelStatusSchema.optional(),
  search: z.string().optional(),
});
export type ReelListQuery = z.infer<typeof ReelListQuerySchema>;

// ===== ANALYSIS DETAIL TYPES =====

export const VideoSceneSchema = z.object({
  timestamp: z.string(),
  description: z.string(),
  action: z.string(),
});
export type VideoScene = z.infer<typeof VideoSceneSchema>;

export const VideoCharacterSchema = z.object({
  id: z.string(),
  age: z.string(),
  gender: z.string(),
  appearance: z.string(),
  clothing: z.string(),
  actions: z.string(),
});
export type VideoCharacter = z.infer<typeof VideoCharacterSchema>;

export const VideoObjectSchema = z.object({
  name: z.string(),
  role: z.string(),
  position: z.string(),
  description: z.string(),
});
export type VideoObject = z.infer<typeof VideoObjectSchema>;

export const CameraMovementSchema = z.object({
  type: z.string(),
  direction: z.string(),
  speed: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});
export type CameraMovement = z.infer<typeof CameraMovementSchema>;

export const VideoTransitionSchema = z.object({
  type: z.string(),
  timestamp: z.string(),
});
export type VideoTransition = z.infer<typeof VideoTransitionSchema>;

export const VideoAudioSchema = z.object({
  music: z.string(),
  speech: z.string(),
  effects: z.string(),
  mood: z.string(),
});
export type VideoAudio = z.infer<typeof VideoAudioSchema>;

export const TextOverlaySchema = z.object({
  text: z.string(),
  timestamp: z.string(),
  position: z.string(),
  style: z.string(),
});
export type TextOverlay = z.infer<typeof TextOverlaySchema>;

export const RemixSuggestionSchema = z.object({
  id: z.string(),
  category: z.enum(["Character", "Background", "Style", "Action"]),
  name: z.string(),
  icon: z.string(),
  prompt: z.string(),
});
export type RemixSuggestion = z.infer<typeof RemixSuggestionSchema>;

export const FullVideoAnalysisSchema = z.object({
  id: z.string(),
  subject: z.string(),
  action: z.string(),
  environment: z.string(),
  cameraStyle: z.string(),
  mood: z.string(),
  colorPalette: z.string(),
  style: z.string(),
  duration: z.number().nullable(),
  aspectRatio: z.string(),
  scenes: z.array(VideoSceneSchema),
  characters: z.array(VideoCharacterSchema),
  objects: z.array(VideoObjectSchema),
  cameraMovements: z.array(CameraMovementSchema),
  lighting: z.string(),
  transitions: z.array(VideoTransitionSchema),
  audio: VideoAudioSchema,
  textOverlays: z.array(TextOverlaySchema),
  klingPrompt: z.string(),
  tags: z.array(z.string()),
  suggestions: z.array(RemixSuggestionSchema).optional(),
  elements: z.array(DetectableElementSchema).optional(),
});
export type FullVideoAnalysis = z.infer<typeof FullVideoAnalysisSchema>;

export const AnalysisPreviewSchema = z.object({
  id: z.string(),
  subject: z.string(),
  action: z.string(),
  style: z.string(),
  klingPrompt: z.string().default(""),
  veo3Prompt: z.string().default(""),
});
export type AnalysisPreview = z.infer<typeof AnalysisPreviewSchema>;

export const VideoAnalysisDbSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  fileName: z.string().nullable(),
  duration: z.number().nullable(),
  aspectRatio: z.string().nullable(),
  elements: z.any(),
  tags: z.array(z.string()).nullable(),
  analysisType: z.string().nullable(),
  subject: z.string().nullable(),
  action: z.string().nullable(),
  style: z.string().nullable(),
  klingPrompt: z.string().nullable(),
  veo3Prompt: z.string().nullable(),
  createdAt: z.string(),
  generations: z.array(z.any()).optional(),
});
export type VideoAnalysisDb = z.infer<typeof VideoAnalysisDbSchema>;

// ===== TEMPLATE TYPES =====

export const ReelPreviewSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  likeCount: z.number().nullable(),
  author: z.string().nullable(),
  source: z.string(),
});
export type ReelPreview = z.infer<typeof ReelPreviewSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  generationCount: z.number(),
  isPublished: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reel: ReelPreviewSchema.optional(),
  analysis: AnalysisPreviewSchema.optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

// ===== VIDEO GENERATION TYPES =====

export const VideoGenerationDbSchema = z.object({
  id: z.string(),
  analysisId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number(),
  progressStage: z.string().nullable(),
  progressMessage: z.string().nullable(),
  klingProgress: z.number().nullable(),
  klingTaskId: z.string().nullable(),
  videoUrl: z.string().nullable(),
  s3Key: z.string().nullable(),
  duration: z.number().nullable(),
  aspectRatio: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});
export type VideoGenerationDb = z.infer<typeof VideoGenerationDbSchema>;

export const GenerateVideoRequestSchema = z.object({
  analysisId: z.string(),
  prompt: z.string(),
  sourceVideoUrl: z.string(),
  options: z
    .object({
      duration: z.union([z.literal(5), z.literal(10)]).optional(),
      aspectRatio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
      keepAudio: z.boolean().optional(),
    })
    .optional(),
});
export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>;

export const AnalyzeDownloadedRequestSchema = z.object({
  hashtag: z.string(),
  filename: z.string(),
});
export type AnalyzeDownloadedRequest = z.infer<
  typeof AnalyzeDownloadedRequestSchema
>;

export const AnalyzeReelRequestSchema = z.object({
  reelId: z.string(),
  url: z.string(),
});
export type AnalyzeReelRequest = z.infer<typeof AnalyzeReelRequestSchema>;

export const AnalyzedVideoResponseSchema = z.object({
  success: z.boolean(),
  analysis: VideoAnalysisDbSchema,
  analysisId: z.string(),
  mode: z.string().optional(),
});
export type AnalyzedVideoResponse = z.infer<typeof AnalyzedVideoResponseSchema>;

export const UpdateAnalysisRequestSchema = z.object({
  subject: z.string().optional(),
  action: z.string().optional(),
  environment: z.string().optional(),
  cameraStyle: z.string().optional(),
  mood: z.string().optional(),
  colorPalette: z.string().optional(),
  style: z.string().optional(),
  duration: z.number().optional(),
  aspectRatio: z.string().optional(),
  scenes: z.any().optional(),
  characters: z.any().optional(),
  objects: z.any().optional(),
  cameraMovements: z.any().optional(),
  lighting: z.string().optional(),
  transitions: z.any().optional(),
  audio: z.any().optional(),
  textOverlays: z.any().optional(),
  pacing: z.string().optional(),
  klingPrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type UpdateAnalysisRequest = z.infer<typeof UpdateAnalysisRequestSchema>;

export const UploadReferenceResponseSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  s3Key: z.string(),
  imageId: z.string(),
});
export type UploadReferenceResponse = z.infer<
  typeof UploadReferenceResponseSchema
>;

// ===== REELS MANAGEMENT TYPES =====

export const AddReelRequestSchema = z.object({
  url: z.string().url(),
});
export type AddReelRequest = z.infer<typeof AddReelRequestSchema>;

export const AddReelResponseSchema = z.object({
  success: z.boolean(),
  reel: ReelPreviewSchema,
  message: z.string(),
  isNew: z.boolean(),
});
export type AddReelResponse = z.infer<typeof AddReelResponseSchema>;

export const ReelStatsResponseSchema = z.object({
  total: z.number(),
  byStatus: z.object({
    scraped: z.number(),
    downloading: z.number(),
    downloaded: z.number(),
    analyzing: z.number(),
    analyzed: z.number(),
    failed: z.number(),
  }),
  templates: z.number(),
  activeGenerations: z.number(),
});
export type ReelStatsResponse = z.infer<typeof ReelStatsResponseSchema>;

export const ProcessReelRequestSchema = z.object({
  useFrames: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});
export type ProcessReelRequest = z.infer<typeof ProcessReelRequestSchema>;

export const ProcessReelResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  jobId: z.string(),
  reelId: z.string(),
});
export type ProcessReelResponse = z.infer<typeof ProcessReelResponseSchema>;

export const RefreshMetadataResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  reel: ReelPreviewSchema,
});
export type RefreshMetadataResponse = z.infer<
  typeof RefreshMetadataResponseSchema
>;

export const ResizeReelResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  resized: z.boolean(),
  originalWidth: z.number().optional(),
  newWidth: z.number().optional(),
});
export type ResizeReelResponse = z.infer<typeof ResizeReelResponseSchema>;

export const BatchRefreshDurationRequestSchema = z.object({
  reelIds: z.array(z.string()),
});
export type BatchRefreshDurationRequest = z.infer<
  typeof BatchRefreshDurationRequestSchema
>;

// ===== REEL FULL SCHEMA =====

export const ReelSchema = z.object({
  id: z.string(),
  url: z.string(),
  videoUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  likeCount: z.number().nullable(),
  author: z.string().nullable(),
  caption: z.string().nullable(),
  hashtag: z.string().nullable(),
  duration: z.number().nullable(),
  status: ReelStatusSchema,
  s3Key: z.string().nullable(),
  localPath: z.string().nullable(),
  source: z.string(),
  progress: z.number(),
  progressStage: z.string().nullable(),
  progressMessage: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Reel = z.infer<typeof ReelSchema>;

export const ReelWithAnalysisSchema = ReelSchema.extend({
  analysis: VideoAnalysisDbSchema.nullable(),
  template: TemplateSchema.nullable(),
});
export type ReelWithAnalysis = z.infer<typeof ReelWithAnalysisSchema>;

// ===== LOG TYPES =====

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const ReelLogSchema = z.object({
  id: z.string(),
  reelId: z.string(),
  level: LogLevelSchema,
  stage: z.string(),
  message: z.string(),
  metadata: z.any().nullable(),
  createdAt: z.string(),
});
export type ReelLog = z.infer<typeof ReelLogSchema>;

export const AIProviderSchema = z.enum(["gemini", "openai", "kling"]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AILogSchema = z.object({
  id: z.string(),
  provider: AIProviderSchema,
  model: z.string(),
  operation: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  durationMs: z.number().nullable(),
  success: z.boolean(),
  error: z.string().nullable(),
  metadata: z.any().nullable(),
  createdAt: z.string(),
});
export type AILog = z.infer<typeof AILogSchema>;

// ===== QUEUE TYPES =====

export const JobStateSchema = z.enum([
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const QueueStatusSchema = z.object({
  name: z.string(),
  waiting: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  delayed: z.number().optional(),
});
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const QueueJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  data: z.any(),
  progress: z.number(),
  state: JobStateSchema,
  timestamp: z.number().optional(),
  processedOn: z.number().optional(),
  finishedOn: z.number().optional(),
  failedReason: z.string().optional(),
});
export type QueueJob = z.infer<typeof QueueJobSchema>;

// ===== SCRAPE TYPES =====

export const SortModeSchema = z.enum(["recent", "top"]);
export type SortMode = z.infer<typeof SortModeSchema>;

export const ScrapeRequestSchema = z.object({
  hashtag: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sort: SortModeSchema.optional(),
  minLikes: z.number().int().min(0).optional(),
});
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export const ScrapeResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string(),
  message: z.string(),
});
export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>;

export const JobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ScrapedReelSchema = z.object({
  code: z.string(),
  url: z.string(),
  videoUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  likeCount: z.number(),
  author: z.string().nullable(),
  caption: z.string().nullable(),
});
export type ScrapedReel = z.infer<typeof ScrapedReelSchema>;

// ===== TRACE TYPES =====

export const SpanKindSchema = z.enum([
  "internal",
  "server",
  "client",
  "producer",
  "consumer",
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

export const SpanStatusSchema = z.enum(["unset", "ok", "error"]);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

export const TraceSpanSchema = z.object({
  spanId: z.string(),
  name: z.string(),
  kind: SpanKindSchema,
  service: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  status: SpanStatusSchema,
  attributes: z.record(z.string(), z.any()).nullable(),
  events: z.array(z.any()).nullable(),
  parentSpanId: z.string().nullable(),
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceSchema = z.object({
  traceId: z.string(),
  rootSpanId: z.string().nullable(),
  service: z.string(),
  operation: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  status: SpanStatusSchema,
  metadata: z.record(z.string(), z.any()).nullable(),
  spans: z.array(TraceSpanSchema).optional(),
});
export type Trace = z.infer<typeof TraceSchema>;

// ===== TRENDS TYPES =====

export const TagTrendSchema = z.object({
  tag: z.string(),
  score: z.number(),
  frequency: z.number(),
});
export type TagTrend = z.infer<typeof TagTrendSchema>;

export const TagTrendsResponseSchema = z.object({
  windowHours: z.number(),
  videosAnalyzed: z.number(),
  tags: z.array(TagTrendSchema),
});
export type TagTrendsResponse = z.infer<typeof TagTrendsResponseSchema>;
