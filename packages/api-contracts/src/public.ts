/**
 * Public API Types
 * Client-facing API contracts: Feed, Content, Media, Remix, Generate
 */

import { z } from "zod";

// ===== ELEMENT TYPES =====

export const VideoElementTypeSchema = z.enum([
  "character",
  "object",
  "background",
]);
export type VideoElementType = z.infer<typeof VideoElementTypeSchema>;

export const RemixOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  prompt: z.string(),
});
export type RemixOption = z.infer<typeof RemixOptionSchema>;

export const DetectableElementSchema = z.object({
  id: z.string(),
  type: VideoElementTypeSchema,
  label: z.string(),
  description: z.string(),
  remixOptions: z.array(RemixOptionSchema),
});
export type DetectableElement = z.infer<typeof DetectableElementSchema>;

// ===== AUTH TYPES =====

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

export const BasicTokenRequestSchema = z.object({
  deviceType: z.string(),
  algorithm: z.string(),
  timestamp: z.string(),
  installationHash: z.string(),
});
export type BasicTokenRequest = z.infer<typeof BasicTokenRequestSchema>;

export const GoogleAuthRequestSchema = z.object({
  idToken: z.string(),
});
export type GoogleAuthRequest = z.infer<typeof GoogleAuthRequestSchema>;

export const AppleAuthRequestSchema = z.object({
  identityToken: z.string(),
  user: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});
export type AppleAuthRequest = z.infer<typeof AppleAuthRequestSchema>;

// ===== FEED TYPES =====

export const FeedTypeSchema = z.enum(["trends", "community", "bookmarks"]);
export type FeedType = z.infer<typeof FeedTypeSchema>;

export const FeedSortSchema = z.enum(["popular", "recent", "trending"]);
export type FeedSort = z.infer<typeof FeedSortSchema>;

export const FeedQuerySchema = z.object({
  type: FeedTypeSchema.default("trends"),
  limit: z.number().int().min(1).max(1000).default(20),
  cursor: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  sort: FeedSortSchema.default("popular"),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedTemplateItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  thumbnailUrl: z.string(),
  previewVideoUrl: z.string().optional(),
  generationCount: z.number(),
  isBookmarked: z.boolean().optional(),
  reel: z.object({
    id: z.string(),
    author: z.string().nullable(),
    likeCount: z.number().nullable(),
  }),
  elements: z.array(
    z.object({
      id: z.string(),
      type: VideoElementTypeSchema,
      label: z.string(),
    })
  ),
});
export type FeedTemplateItem = z.infer<typeof FeedTemplateItemSchema>;

export const FeedResponseSchema = z.object({
  items: z.array(FeedTemplateItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;

// ===== CONTENT TYPES =====

export const ContentStatusSchema = z.enum(["new", "existing", "processing"]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const ContentFromUrlRequestSchema = z.object({
  url: z.string().url(),
  autoProcess: z.boolean().default(true),
});
export type ContentFromUrlRequest = z.infer<typeof ContentFromUrlRequestSchema>;

export const ContentFromUrlResponseSchema = z.object({
  success: z.boolean(),
  contentId: z.string(),
  status: ContentStatusSchema,
  existingAnalysis: z
    .object({
      analysisId: z.string(),
      templateId: z.string().optional(),
    })
    .optional(),
  jobId: z.string().optional(),
});
export type ContentFromUrlResponse = z.infer<
  typeof ContentFromUrlResponseSchema
>;

export const ContentUploadResponseSchema = z.object({
  success: z.boolean(),
  contentId: z.string(),
  jobId: z.string(),
  status: z.literal("processing"),
});
export type ContentUploadResponse = z.infer<typeof ContentUploadResponseSchema>;

export const ContentProcessingStatusSchema = z.enum([
  "pending",
  "downloading",
  "analyzing",
  "ready",
  "failed",
]);
export type ContentProcessingStatus = z.infer<
  typeof ContentProcessingStatusSchema
>;

export const ContentStatusResponseSchema = z.object({
  contentId: z.string(),
  status: ContentProcessingStatusSchema,
  progress: z.number().min(0).max(100),
  stage: z.string(),
  message: z.string(),
  analysis: z
    .object({
      id: z.string(),
      duration: z.number().nullable(),
      aspectRatio: z.string(),
      elements: z.array(DetectableElementSchema),
      scenes: z
        .array(
          z.object({
            id: z.string(),
            index: z.number(),
            startTime: z.number(),
            endTime: z.number(),
            duration: z.number(),
            thumbnailUrl: z.string().nullable(),
            elements: z.array(DetectableElementSchema),
          })
        )
        .optional(),
    })
    .optional(),
  templateId: z.string().optional(),
  error: z.string().optional(),
});
export type ContentStatusResponse = z.infer<typeof ContentStatusResponseSchema>;

// ===== MEDIA TYPES =====

export const MediaTypeSchema = z.enum(["image", "video"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaSourceSchema = z.enum(["upload", "generated"]);
export type MediaSource = z.infer<typeof MediaSourceSchema>;

export const MediaItemSchema = z.object({
  id: z.string(),
  type: MediaTypeSchema,
  url: z.string(),
  thumbnailUrl: z.string(),
  filename: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable(),
  mimeType: z.string().nullable(),
  createdAt: z.string(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const ExtendedMediaItemSchema = MediaItemSchema.extend({
  source: MediaSourceSchema,
  category: z.string().nullable(),
  prompt: z.string().nullable(),
  style: z.string().nullable(),
});
export type ExtendedMediaItem = z.infer<typeof ExtendedMediaItemSchema>;

export const PersonalMediaQuerySchema = z.object({
  type: z.enum(["image", "video", "all"]).default("all"),
  source: z.enum(["upload", "generated", "all"]).default("all"),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type PersonalMediaQuery = z.infer<typeof PersonalMediaQuerySchema>;
/** Input type for PersonalMediaQuery - use for API requests */
export type PersonalMediaQueryInput = z.input<typeof PersonalMediaQuerySchema>;

export const PersonalMediaResponseSchema = z.object({
  items: z.array(ExtendedMediaItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type PersonalMediaResponse = z.infer<typeof PersonalMediaResponseSchema>;

export const MediaUploadResponseSchema = z.object({
  success: z.boolean(),
  media: MediaItemSchema,
});
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;

export const StockMediaItemSchema = MediaItemSchema.extend({
  source: z.string(),
  attribution: z.string().optional(),
});
export type StockMediaItem = z.infer<typeof StockMediaItemSchema>;

export const StockMediaResponseSchema = z.object({
  items: z.array(StockMediaItemSchema),
  total: z.number(),
  categories: z.array(z.string()),
});
export type StockMediaResponse = z.infer<typeof StockMediaResponseSchema>;

// ===== REMIX TYPES (Simple/Expert Mode) =====

export const SimpleElementSchema = z.object({
  id: z.string(),
  type: VideoElementTypeSchema,
  label: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().optional(),
  remixOptions: z.array(RemixOptionSchema),
  allowCustomImage: z.boolean(),
});
export type SimpleElement = z.infer<typeof SimpleElementSchema>;

export const SimpleSceneSchema = z.object({
  id: z.string(),
  index: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  thumbnailUrl: z.string().nullable(),
  elements: z.array(SimpleElementSchema),
  canKeepOriginal: z.boolean(),
});
export type SimpleScene = z.infer<typeof SimpleSceneSchema>;

export const SimpleRemixDataResponseSchema = z.object({
  analysisId: z.string(),
  sourceVideo: z.object({
    url: z.string(),
    thumbnailUrl: z.string(),
    duration: z.number().nullable(),
    aspectRatio: z.string(),
  }),
  elements: z.array(SimpleElementSchema),
  scenes: z.array(SimpleSceneSchema).optional(),
  isSceneBased: z.boolean(),
});
export type SimpleRemixDataResponse = z.infer<
  typeof SimpleRemixDataResponseSchema
>;

export const ElementSelectionSchema = z.object({
  element_id: z.string(),
  selected_option_id: z.string().optional(),
  custom_media_id: z.string().optional(),
  custom_media_url: z.string().optional(),
});
export type ElementSelection = z.infer<typeof ElementSelectionSchema>;

export const SceneSelectionSchema = z.object({
  scene_id: z.string(),
  use_original: z.boolean(),
  element_selections: z.array(ElementSelectionSchema).optional(),
});
export type SceneSelection = z.infer<typeof SceneSelectionSchema>;

export const SimpleConfigureRequestSchema = z.object({
  selections: z.array(ElementSelectionSchema),
  scene_selections: z.array(SceneSelectionSchema).optional(),
});
export type SimpleConfigureRequest = z.infer<
  typeof SimpleConfigureRequestSchema
>;

export const ConfigureResponseSchema = z.object({
  success: z.boolean(),
  configurationId: z.string(),
  generatedPrompt: z.string(),
  estimatedCredits: z.number(),
});
export type ConfigureResponse = z.infer<typeof ConfigureResponseSchema>;

export const ExpertRemixDataResponseSchema = z.object({
  analysisId: z.string(),
  sourceVideo: z.object({
    url: z.string(),
    thumbnailUrl: z.string(),
    duration: z.number().nullable(),
    aspectRatio: z.string(),
  }),
  suggestedPrompt: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      description: z.string(),
    })
  ),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        index: z.number(),
        startTime: z.number(),
        endTime: z.number(),
        suggestedPrompt: z.string(),
      })
    )
    .optional(),
  promptHints: z.array(z.string()),
  previousGenerations: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        thumbnailUrl: z.string().nullable(),
        status: z.string(),
      })
    )
    .optional(),
});
export type ExpertRemixDataResponse = z.infer<
  typeof ExpertRemixDataResponseSchema
>;

export const GenerationOptionsSchema = z.object({
  duration: z.union([z.literal(5), z.literal(10)]).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
  keepAudio: z.boolean().optional(),
});
export type GenerationOptions = z.infer<typeof GenerationOptionsSchema>;

export const ExpertConfigureRequestSchema = z.object({
  prompt: z.string(),
  referenceImages: z.array(z.string()).optional(),
  scenePrompts: z
    .array(
      z.object({
        sceneId: z.string(),
        prompt: z.string(),
        useOriginal: z.boolean(),
      })
    )
    .optional(),
  options: GenerationOptionsSchema.optional(),
});
export type ExpertConfigureRequest = z.infer<
  typeof ExpertConfigureRequestSchema
>;

// ===== GENERATE TYPES =====

export const GenerateRequestSchema = z.object({
  configuration_id: z.string().optional(),
  analysis_id: z.string().optional(),
  prompt: z.string().optional(),
  scene_selections: z.array(SceneSelectionSchema).optional(),
  options: GenerationOptionsSchema.optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  success: z.boolean(),
  generationId: z.string().optional(),
  compositeGenerationId: z.string().optional(),
  sceneGenerationIds: z.array(z.string()).optional(),
  type: z.enum(["full", "composite"]).optional(),
  status: z.literal("queued"),
  estimatedWaitTime: z.number().optional(),
  queuePosition: z.number().optional(),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export const GenerationStageSchema = z.enum([
  "analyzing",
  "generating_character",
  "setting_up_lighting",
  "applying_style",
  "rendering",
  "finalizing",
]);
export type GenerationStage = z.infer<typeof GenerationStageSchema>;

export const GenerationStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

export const GenerationStatusResponseSchema = z.object({
  generationId: z.string(),
  status: GenerationStatusSchema,
  progress: z.number(),
  stage: GenerationStageSchema,
  message: z.string(),
  providerProgress: z.number().optional(),
  result: z
    .object({
      videoUrl: z.string(),
      thumbnailUrl: z.string().nullable(),
      duration: z.number().nullable(),
    })
    .optional(),
  sceneStatuses: z
    .array(
      z.object({
        sceneId: z.string(),
        status: z.string(),
        progress: z.number(),
        videoUrl: z.string().optional(),
      })
    )
    .optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type GenerationStatusResponse = z.infer<
  typeof GenerationStatusResponseSchema
>;

export const CompositeStatusSchema = z.enum([
  "pending",
  "waiting",
  "concatenating",
  "uploading",
  "completed",
  "failed",
]);
export type CompositeStatus = z.infer<typeof CompositeStatusSchema>;

export const CompositeStatusResponseSchema = z.object({
  compositeGenerationId: z.string(),
  status: CompositeStatusSchema,
  progress: z.number(),
  stage: z.string().optional(),
  message: z.string().optional(),
  result: z
    .object({
      videoUrl: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});
export type CompositeStatusResponse = z.infer<
  typeof CompositeStatusResponseSchema
>;

export const GenerationSourceTypeSchema = z.enum(["template", "upload", "url"]);
export type GenerationSourceType = z.infer<typeof GenerationSourceTypeSchema>;

export const GenerationItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  progress: z.number(),
  prompt: z.string(),
  thumbnailUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  source: z.object({
    type: GenerationSourceTypeSchema,
    templateId: z.string().optional(),
    templateTitle: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
});
export type GenerationItem = z.infer<typeof GenerationItemSchema>;

export const GenerationsListResponseSchema = z.object({
  generations: z.array(GenerationItemSchema),
  total: z.number(),
});
export type GenerationsListResponse = z.infer<
  typeof GenerationsListResponseSchema
>;

// ===== SEARCH TYPES =====

export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResponseSchema = z.object({
  items: z.array(FeedTemplateItemSchema),
  total: z.number(),
  query: z.string(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ===== BOOKMARK TYPES =====

export const BookmarkResponseSchema = z.object({
  bookmarked: z.boolean(),
  templateId: z.string(),
});
export type BookmarkResponse = z.infer<typeof BookmarkResponseSchema>;

// ===== ASSET GENERATION TYPES =====

export const AssetCategorySchema = z.enum([
  "background",
  "character",
  "object",
  "texture",
]);
export type AssetCategory = z.infer<typeof AssetCategorySchema>;

export const AssetAspectRatioSchema = z.enum([
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
]);
export type AssetAspectRatio = z.infer<typeof AssetAspectRatioSchema>;

export const AssetGenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  category: AssetCategorySchema,
  aspectRatio: AssetAspectRatioSchema.default("1:1"),
  style: z.string().optional(),
});
export type AssetGenerateRequest = z.infer<typeof AssetGenerateRequestSchema>;

export const GeneratedAssetSchema = z.object({
  id: z.string(),
  url: z.string(),
  prompt: z.string(),
  category: AssetCategorySchema,
  width: z.number().optional(),
  height: z.number().optional(),
});
export type GeneratedAsset = z.infer<typeof GeneratedAssetSchema>;

export const AssetGenerateResponseSchema = z.object({
  success: z.boolean(),
  asset: GeneratedAssetSchema,
});
export type AssetGenerateResponse = z.infer<typeof AssetGenerateResponseSchema>;

export const AssetCategoryInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  examples: z.array(z.string()),
});
export type AssetCategoryInfo = z.infer<typeof AssetCategoryInfoSchema>;

export const AssetCategoriesResponseSchema = z.object({
  categories: z.array(AssetCategoryInfoSchema),
});
export type AssetCategoriesResponse = z.infer<
  typeof AssetCategoriesResponseSchema
>;

export const AssetStylePresetSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});
export type AssetStylePreset = z.infer<typeof AssetStylePresetSchema>;

export const AssetStylePresetsResponseSchema = z.object({
  styles: z.array(AssetStylePresetSchema),
});
export type AssetStylePresetsResponse = z.infer<
  typeof AssetStylePresetsResponseSchema
>;

// ===== PUBLISH & SHARE TYPES =====

export const PublishGenerationRequestSchema = z.object({
  isShared: z.boolean().default(true),
  communityConsent: z.boolean(),
  title: z.string().optional(),
});
export type PublishGenerationRequest = z.infer<
  typeof PublishGenerationRequestSchema
>;

export const PublishGenerationResponseSchema = z.object({
  success: z.boolean(),
  templateId: z.string().optional(),
});
export type PublishGenerationResponse = z.infer<
  typeof PublishGenerationResponseSchema
>;

export const SocialPlatformSchema = z.enum([
  "instagram",
  "tiktok",
  "youtube",
  "generic",
]);
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;

export const SocialShareRequestSchema = z.object({
  platform: SocialPlatformSchema,
});
export type SocialShareRequest = z.infer<typeof SocialShareRequestSchema>;

export const SocialShareResponseSchema = z.object({
  success: z.boolean(),
  shareUrl: z.string().optional(),
});
export type SocialShareResponse = z.infer<typeof SocialShareResponseSchema>;
