/**
 * Public API Schemas
 *
 * Публичные схемы для клиентского флоу:
 * - Feed (templates)
 * - Content (input)
 * - Media (library)
 * - Remix (simple/expert)
 * - Generate
 *
 * Документация: docs/api-contracts.md
 */

import { z } from "@hono/zod-openapi";

// ===== SHARED ELEMENT SCHEMAS =====

export const RemixOptionSchema = z
  .object({
    id: z.string().openapi({ description: "Variant ID", example: "variant-1" }),
    label: z
      .string()
      .openapi({ description: "Display label", example: "Cyberpunk Robot" }),
    icon: z.string().openapi({ description: "Emoji icon", example: "🤖" }),
    prompt: z.string().openapi({
      description: "Transformation prompt",
      example: "Transform the subject into...",
    }),
  })
  .openapi("RemixOption");

export const DetectableElementSchema = z
  .object({
    id: z.string().openapi({ description: "Element ID", example: "char-1" }),
    type: z
      .enum(["character", "object", "background"])
      .openapi({ description: "Element type" }),
    label: z
      .string()
      .openapi({ description: "Element label", example: "Ginger Cat" }),
    description: z.string().openapi({
      description: "Description",
      example: "A fluffy ginger cat...",
    }),
    remixOptions: z.array(RemixOptionSchema),
  })
  .openapi("DetectableElement");

// ===== FEED API SCHEMAS =====

export const FeedQuerySchema = z.object({
  type: z
    .enum(["trends", "community", "bookmarks"])
    .default("trends")
    .openapi({
      param: { name: "type", in: "query" },
      description:
        "Feed type: trends (featured), community (all), bookmarks (user saved)",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(20)
    .openapi({ param: { name: "limit", in: "query" } }),
  cursor: z
    .string()
    .optional()
    .openapi({ param: { name: "cursor", in: "query" } }),
  category: z
    .string()
    .optional()
    .openapi({ param: { name: "category", in: "query" } }),
  tags: z
    .string()
    .optional()
    .openapi({
      param: { name: "tags", in: "query" },
      description: "Comma-separated tags",
    }),
  sort: z
    .enum(["popular", "recent", "trending"])
    .default("popular")
    .openapi({ param: { name: "sort", in: "query" } }),
});

export const FeedTemplateItemSchema = z
  .object({
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
        type: z.enum(["character", "object", "background"]),
        label: z.string(),
      })
    ),
  })
  .openapi("FeedTemplateItem");

export const FeedResponseSchema = z
  .object({
    items: z.array(FeedTemplateItemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("FeedResponse");

// ===== CONTENT API SCHEMAS =====

export const ContentFromUrlRequestSchema = z
  .object({
    url: z.string().url().openapi({
      description: "Instagram Reel URL",
      example: "https://www.instagram.com/reel/ABC123/",
    }),
    autoProcess: z.boolean().default(true).openapi({
      description: "Automatically start analysis after download",
    }),
  })
  .openapi("ContentFromUrlRequest");

export const ContentFromUrlResponseSchema = z
  .object({
    success: z.boolean(),
    contentId: z.string().openapi({ description: "Content ID (reelId)" }),
    status: z.enum(["new", "existing", "processing"]),
    existingAnalysis: z
      .object({
        analysisId: z.string(),
        templateId: z.string().optional(),
      })
      .optional(),
    jobId: z.string().optional(),
  })
  .openapi("ContentFromUrlResponse");

export const ContentUploadResponseSchema = z
  .object({
    success: z.boolean(),
    contentId: z.string().openapi({ description: "Content ID" }),
    jobId: z.string(),
    status: z.literal("processing"),
  })
  .openapi("ContentUploadResponse");

export const ContentStatusResponseSchema = z
  .object({
    contentId: z.string(),
    status: z.enum(["pending", "downloading", "analyzing", "ready", "failed"]),
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
  })
  .openapi("ContentStatusResponse");

// ===== MEDIA LIBRARY SCHEMAS =====

export const MediaItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(["image", "video"]),
    url: z.string(),
    thumbnailUrl: z.string(),
    filename: z.string(),
    size: z.number(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    duration: z.number().nullable(),
    mimeType: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("MediaItem");

export const PersonalMediaQuerySchema = z.object({
  type: z
    .enum(["image", "video", "all"])
    .default("all")
    .openapi({ param: { name: "type", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" } }),
});

export const PersonalMediaResponseSchema = z
  .object({
    items: z.array(MediaItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .openapi("PersonalMediaResponse");

export const MediaUploadResponseSchema = z
  .object({
    success: z.boolean(),
    media: MediaItemSchema,
  })
  .openapi("MediaUploadResponse");

export const StockMediaQuerySchema = z.object({
  query: z
    .string()
    .optional()
    .openapi({ param: { name: "query", in: "query" } }),
  category: z
    .string()
    .optional()
    .openapi({ param: { name: "category", in: "query" } }),
  type: z
    .enum(["image", "video"])
    .optional()
    .openapi({ param: { name: "type", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" } }),
});

export const StockMediaItemSchema = MediaItemSchema.extend({
  source: z
    .string()
    .openapi({ description: "Stock source (pexels, unsplash)" }),
  attribution: z.string().optional(),
}).openapi("StockMediaItem");

export const StockMediaResponseSchema = z
  .object({
    items: z.array(StockMediaItemSchema),
    total: z.number(),
    categories: z.array(z.string()),
  })
  .openapi("StockMediaResponse");

// ===== REMIX API SCHEMAS (Simple/Expert Mode) =====

export const SimpleElementSchema = z
  .object({
    id: z.string(),
    type: z.enum(["character", "object", "background"]),
    label: z.string(),
    description: z.string(),
    thumbnailUrl: z.string().optional(),
    remixOptions: z.array(RemixOptionSchema),
    allowCustomImage: z.boolean(),
  })
  .openapi("SimpleElement");

export const SimpleSceneSchema = z
  .object({
    id: z.string(),
    index: z.number(),
    startTime: z.number(),
    endTime: z.number(),
    thumbnailUrl: z.string().nullable(),
    elements: z.array(SimpleElementSchema),
    canKeepOriginal: z.boolean(),
  })
  .openapi("SimpleScene");

export const SimpleRemixDataResponseSchema = z
  .object({
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
  })
  .openapi("SimpleRemixDataResponse");

export const ElementSelectionSchema = z
  .object({
    elementId: z.string().openapi({
      description: "ID элемента из analysis.elements",
    }),
    selectedOptionId: z.string().optional().openapi({
      description:
        "ID выбранной опции из element.remixOptions (предустановленный вариант)",
    }),
    customMediaId: z.string().optional().openapi({
      description: "ID медиа из библиотеки пользователя",
    }),
    customMediaUrl: z
      .string()
      .optional()
      .openapi({
        description:
          "URL кастомного изображения для замены элемента. " +
          "Бэкенд автоматически добавит <<<image_N>>> в промпт и передаст URL в Kling image_list",
        example: "https://storage.example.com/uploads/my-character.jpg",
      }),
  })
  .openapi("ElementSelection", {
    description:
      "Выбор для элемента: selectedOptionId (предустановленный вариант) " +
      "ИЛИ customMediaUrl (своё изображение). При customMediaUrl бэкенд " +
      "формирует промпт с <<<image_N>>> референсами для Kling API",
  });

export const SceneSelectionSchema = z
  .object({
    sceneId: z.string().openapi({
      description: "ID сцены из analysis.scenes",
    }),
    useOriginal: z.boolean().openapi({
      description:
        "true = использовать оригинальный фрагмент без генерации, " +
        "false = генерировать с промптом из elementSelections",
    }),
    elementSelections: z
      .array(ElementSelectionSchema)
      .optional()
      .openapi({
        description:
          "Выборы элементов для ЭТОЙ сцены. Из них строится уникальный промпт для генерации этой сцены. " +
          "elementId должен соответствовать элементам из scene.elements, а не глобальным elements",
      }),
  })
  .openapi("SceneSelection", {
    description:
      "Конфигурация для одной сцены. Каждая сцена с useOriginal=false получает СВОЙ промпт, " +
      "построенный из её elementSelections и элементов этой сцены (scene.elements)",
  });

export const SimpleConfigureRequestSchema = z
  .object({
    selections: z.array(ElementSelectionSchema).openapi({
      description:
        "Массив выборов для каждого элемента. Для каждого элемента можно указать " +
        "selectedOptionId (готовый вариант) или customMediaUrl (своё изображение)",
    }),
    sceneSelections: z.array(SceneSelectionSchema).optional().openapi({
      description: "Выборы по сценам (для scene-based режима)",
    }),
  })
  .openapi("SimpleConfigureRequest", {
    description:
      "Конфигурация Simple Mode. Бэкенд автоматически формирует промпт из выборов, " +
      "добавляя <<<image_N>>> референсы для customMediaUrl и собирая URLs в image_list для Kling API",
  });

export const ConfigureResponseSchema = z
  .object({
    success: z.boolean(),
    configurationId: z.string().openapi({
      description: "ID конфигурации для передачи в /generate",
    }),
    generatedPrompt: z.string().openapi({
      description:
        "Сгенерированный промпт с <<<image_N>>> референсами (Simple mode) " +
        "или исходный промпт пользователя (Expert mode)",
    }),
    estimatedCredits: z.number().openapi({
      description: "Оценка стоимости генерации в кредитах",
    }),
  })
  .openapi("ConfigureResponse", {
    description:
      "Ответ после сохранения конфигурации. configurationId используется для запуска генерации",
  });

export const ExpertRemixDataResponseSchema = z
  .object({
    analysisId: z.string(),
    sourceVideo: z.object({
      url: z.string(),
      thumbnailUrl: z.string(),
      duration: z.number().nullable(),
      aspectRatio: z.string(),
    }),
    suggestedPrompt: z.string().openapi({
      description: "Предложенный промпт на основе анализа видео",
    }),
    elements: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          label: z.string(),
          description: z.string(),
        })
      )
      .openapi({
        description: "Элементы для справки при написании промпта",
      }),
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
    promptHints: z.array(z.string()).openapi({
      description: "Подсказки по написанию промпта",
      example: [
        "Используйте @Video1 для референса на исходное видео",
        "Используйте @Image1, @Image2... для своих изображений",
        "Опишите желаемые изменения конкретно",
      ],
    }),
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
  })
  .openapi("ExpertRemixDataResponse", {
    description:
      "Данные для Expert Mode с подсказками по использованию image references",
  });

export const GenerationOptionsSchema = z
  .object({
    duration: z.union([z.literal(5), z.literal(10)]).optional(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
    keepAudio: z.boolean().optional(),
  })
  .openapi("GenerationOptions");

export const ExpertConfigureRequestSchema = z
  .object({
    prompt: z.string().openapi({
      description:
        "Промпт для генерации. Можно использовать @Video1 для референса на исходное видео, " +
        "@Image1, @Image2... для референсов на изображения из referenceImages (по порядку). " +
        "Бэкенд конвертирует в <<<video_1>>>, <<<image_1>>> и т.д. для Kling API",
      example:
        "Transform @Video1: replace the main character with the person from @Image1, " +
        "change the background to cyberpunk city style",
    }),
    referenceImages: z
      .array(z.string())
      .optional()
      .openapi({
        description:
          "URLs изображений для референсов в промпте (@Image1 = первый URL, @Image2 = второй и т.д.). " +
          "Передаются в Kling API как image_list",
        example: [
          "https://storage.example.com/my-face.jpg",
          "https://storage.example.com/background.jpg",
        ],
      }),
    scenePrompts: z
      .array(
        z.object({
          sceneId: z.string(),
          prompt: z.string(),
          useOriginal: z.boolean(),
        })
      )
      .optional()
      .openapi({
        description: "Промпты для отдельных сцен (scene-based режим)",
      }),
    options: GenerationOptionsSchema.optional(),
  })
  .openapi("ExpertConfigureRequest", {
    description:
      "Конфигурация Expert Mode. Пользователь сам пишет промпт с @Image1, @Image2 референсами " +
      "и передаёт URLs изображений в referenceImages. Бэкенд передаёт их в Kling image_list",
  });

// ===== GENERATE API SCHEMAS =====

export const GenerateRequestSchema = z
  .object({
    configurationId: z.string().optional().openapi({
      description: "Config ID from Simple/Expert mode",
    }),
    analysisId: z.string().optional().openapi({
      description: "Direct analysis ID (for quick generate)",
    }),
    prompt: z.string().optional().openapi({
      description: "Direct prompt (for quick generate)",
    }),
    options: GenerationOptionsSchema.optional(),
  })
  .openapi("GenerateRequest");

export const GenerateResponseSchema = z
  .object({
    success: z.boolean(),
    generationId: z.string().optional(),
    compositeGenerationId: z.string().optional(),
    sceneGenerationIds: z.array(z.string()).optional(),
    type: z.enum(["full", "composite"]).optional(),
    status: z.literal("queued"),
    estimatedWaitTime: z.number().optional(),
    queuePosition: z.number().optional(),
  })
  .openapi("GenerateResponse");

export const GenerationStatusResponseSchema = z
  .object({
    generationId: z.string(),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    progress: z.number(),
    stage: z.string(),
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
  })
  .openapi("GenerationStatusResponse");

export const GenerationItemSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    progress: z.number(),
    prompt: z.string(),
    thumbnailUrl: z.string().nullable(),
    videoUrl: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
    source: z.object({
      type: z.enum(["template", "upload", "url"]),
      templateId: z.string().optional(),
      templateTitle: z.string().optional(),
    }),
  })
  .openapi("GenerationItem");

export const GenerationsListResponseSchema = z
  .object({
    generations: z.array(GenerationItemSchema),
    total: z.number(),
  })
  .openapi("GenerationsListResponse");

export const VideoGenerationListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" } }),
  status: z
    .string()
    .optional()
    .openapi({ param: { name: "status", in: "query" } }),
});

// ===== SEARCH API SCHEMAS =====

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .openapi({
      param: { name: "q", in: "query" },
      description: "Search query",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" } }),
});

export const SearchResponseSchema = z
  .object({
    items: z.array(FeedTemplateItemSchema),
    total: z.number(),
    query: z.string(),
  })
  .openapi("SearchResponse");

// ===== BOOKMARK API SCHEMAS =====

export const BookmarkResponseSchema = z
  .object({
    bookmarked: z.boolean(),
    templateId: z.string(),
  })
  .openapi("BookmarkResponse");
