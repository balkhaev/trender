/**
 * Internal API Types
 * Admin/debug API contracts: Reels, Analysis, Templates, Pipeline
 * All fields use snake_case convention for REST API compatibility
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
  min_likes: z.number().int().min(0).optional(),
  hashtag: z.string().optional(),
  status: ReelStatusSchema.optional(),
  search: z.string().optional(),
});
export type ReelListQuery = z.infer<typeof ReelListQuerySchema>;

// ===== ANALYSIS DETAIL TYPES =====

export const VideoAnalysisSchema = z.object({
  id: z.string(),
  duration: z.number().nullable(),
  aspect_ratio: z.string(),
  tags: z.array(z.string()),
  elements: z.array(DetectableElementSchema),
});
export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

export const AnalysisPreviewSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()),
  elements_count: z.number(),
});
export type AnalysisPreview = z.infer<typeof AnalysisPreviewSchema>;

/** Generation reference schema for VideoAnalysisDb */
export const GenerationRefSchema = z.object({
  id: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export const VideoAnalysisDbSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_id: z.string().nullable(),
  file_name: z.string().nullable(),
  duration: z.number().nullable(),
  aspect_ratio: z.string().nullable(),
  elements: z.array(DetectableElementSchema),
  tags: z.array(z.string()).nullable(),
  analysis_type: z.string().nullable(),
  has_scenes: z.boolean().optional(),
  scenes_count: z.number().nullable().optional(),
  created_at: z.string(),
  generations: z.array(GenerationRefSchema).optional(),
});
export type VideoAnalysisDb = z.infer<typeof VideoAnalysisDbSchema>;

// ===== TEMPLATE TYPES =====

export const ReelPreviewSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbnail_url: z.string().nullable(),
  like_count: z.number().nullable(),
  author: z.string().nullable(),
  source: z.string(),
});
export type ReelPreview = z.infer<typeof ReelPreviewSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  generation_count: z.number(),
  is_published: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  reel: ReelPreviewSchema.optional(),
  analysis: AnalysisPreviewSchema.optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

// ===== VIDEO GENERATION TYPES =====

export const VideoGenerationDbSchema = z.object({
  id: z.string(),
  analysis_id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number(),
  progress_stage: z.string().nullable(),
  progress_message: z.string().nullable(),
  kling_progress: z.number().nullable(),
  kling_task_id: z.string().nullable(),
  video_url: z.string().nullable(),
  s3_key: z.string().nullable(),
  duration: z.number().nullable(),
  aspect_ratio: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  error: z.string().nullable(),
  last_activity_at: z.string().nullable(),
});
export type VideoGenerationDb = z.infer<typeof VideoGenerationDbSchema>;

export const GenerateVideoRequestSchema = z.object({
  analysis_id: z.string(),
  prompt: z.string(),
  source_video_url: z.string(),
  options: z
    .object({
      duration: z
        .preprocess(
          (val) => (typeof val === "string" ? Number(val) : val),
          z.number().min(5).max(10)
        )
        .optional(),
      aspect_ratio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
      keep_audio: z.boolean().optional(),
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
  reel_id: z.string(),
  url: z.string(),
});
export type AnalyzeReelRequest = z.infer<typeof AnalyzeReelRequestSchema>;

export const AnalyzedVideoResponseSchema = z.object({
  success: z.boolean(),
  analysis: VideoAnalysisDbSchema,
  analysis_id: z.string(),
  mode: z.string().optional(),
});
export type AnalyzedVideoResponse = z.infer<typeof AnalyzedVideoResponseSchema>;

export const UpdateAnalysisRequestSchema = z.object({
  duration: z.number().optional(),
  aspect_ratio: z.string().optional(),
  tags: z.array(z.string()).optional(),
  elements: z.array(DetectableElementSchema).optional(),
});
export type UpdateAnalysisRequest = z.infer<typeof UpdateAnalysisRequestSchema>;

export const UploadReferenceResponseSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  s3_key: z.string(),
  image_id: z.string(),
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
  is_new: z.boolean(),
});
export type AddReelResponse = z.infer<typeof AddReelResponseSchema>;

export const ReelStatsResponseSchema = z.object({
  total: z.number(),
  by_status: z.object({
    scraped: z.number(),
    downloading: z.number(),
    downloaded: z.number(),
    analyzing: z.number(),
    analyzed: z.number(),
    failed: z.number(),
  }),
  templates: z.number(),
  active_generations: z.number(),
});
export type ReelStatsResponse = z.infer<typeof ReelStatsResponseSchema>;

export const ProcessReelRequestSchema = z.object({
  use_frames: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});
export type ProcessReelRequest = z.infer<typeof ProcessReelRequestSchema>;

export const ProcessReelResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  job_id: z.string(),
  reel_id: z.string(),
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
  original_width: z.number().optional(),
  new_width: z.number().optional(),
});
export type ResizeReelResponse = z.infer<typeof ResizeReelResponseSchema>;

export const BatchRefreshDurationRequestSchema = z.object({
  reel_ids: z.array(z.string()),
});
export type BatchRefreshDurationRequest = z.infer<
  typeof BatchRefreshDurationRequestSchema
>;

// ===== REEL FULL SCHEMA =====

export const ReelSchema = z.object({
  id: z.string(),
  url: z.string(),
  video_url: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  like_count: z.number().nullable(),
  author: z.string().nullable(),
  caption: z.string().nullable(),
  hashtag: z.string().nullable(),
  duration: z.number().nullable(),
  status: ReelStatusSchema,
  s3_key: z.string().nullable(),
  local_path: z.string().nullable(),
  source: z.string(),
  progress: z.number(),
  progress_stage: z.string().nullable(),
  progress_message: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
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
  reel_id: z.string(),
  level: LogLevelSchema,
  stage: z.string(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
export type ReelLog = z.infer<typeof ReelLogSchema>;

export const AIProviderSchema = z.enum(["gemini", "openai", "kling"]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AILogSchema = z.object({
  id: z.string(),
  provider: AIProviderSchema,
  model: z.string(),
  operation: z.string(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  duration_ms: z.number().nullable(),
  success: z.boolean(),
  error: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
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
  data: z.record(z.string(), z.unknown()),
  progress: z.number(),
  state: JobStateSchema,
  timestamp: z.number().optional(),
  processed_on: z.number().optional(),
  finished_on: z.number().optional(),
  failed_reason: z.string().optional(),
});
export type QueueJob = z.infer<typeof QueueJobSchema>;

// ===== SCRAPE TYPES =====

export const SortModeSchema = z.enum(["recent", "top"]);
export type SortMode = z.infer<typeof SortModeSchema>;

export const ScrapeRequestSchema = z.object({
  hashtag: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sort: SortModeSchema.optional(),
  min_likes: z.number().int().min(0).optional(),
});
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export const ScrapeResponseSchema = z.object({
  success: z.boolean(),
  job_id: z.string(),
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
  video_url: z.string(),
  thumbnail_url: z.string().nullable(),
  like_count: z.number(),
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
  span_id: z.string(),
  name: z.string(),
  kind: SpanKindSchema,
  service: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  status: SpanStatusSchema,
  attributes: z.record(z.string(), z.unknown()).nullable(),
  events: z.array(z.record(z.string(), z.unknown())).nullable(),
  parent_span_id: z.string().nullable(),
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceSchema = z.object({
  trace_id: z.string(),
  root_span_id: z.string().nullable(),
  service: z.string(),
  operation: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  status: SpanStatusSchema,
  metadata: z.record(z.string(), z.unknown()).nullable(),
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
