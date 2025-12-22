import { z } from "@hono/zod-openapi";

// --- Error Schemas ---

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message details",
      example: "Invalid input provided",
    }),
  })
  .openapi("ErrorResponse");

export const NotFoundResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Resource not found message",
      example: "Reel not found",
    }),
  })
  .openapi("NotFoundResponse");

export const UnauthorizedResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Authentication failure message",
      example: "Invalid or expired token",
    }),
  })
  .openapi("UnauthorizedResponse");

// --- Query Schemas ---

export const ListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: "offset", in: "query" } }),
  category: z
    .string()
    .optional()
    .openapi({ param: { name: "category", in: "query" } }),
  tag: z
    .string()
    .optional()
    .openapi({ param: { name: "tag", in: "query" } }),
  published: z.coerce
    .boolean()
    .optional()
    .openapi({ param: { name: "published", in: "query" } }),
});

// --- Common Schemas ---

export const VideoSceneSchema = z
  .object({
    timestamp: z.string().openapi({
      description: "Time range in MM:SS-MM:SS format",
      example: "0:00-0:03",
    }),
    description: z.string().openapi({
      description: "Visual description of the scene",
      example: "Close up of a coffee cup",
    }),
    action: z.string().openapi({
      description: "Main action in the scene",
      example: "Steam rising from the cup",
    }),
  })
  .openapi("VideoScene");

export const VideoCharacterSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the character",
      example: "person1",
    }),
    age: z
      .string()
      .openapi({ description: "Approximate age", example: "mid-20s" }),
    gender: z
      .string()
      .openapi({ description: "Gender of the character", example: "female" }),
    appearance: z.string().openapi({
      description: "Detailed look",
      example: "Blonde hair, blue eyes",
    }),
    clothing: z.string().openapi({
      description: "What they are wearing",
      example: "Red sweater",
    }),
    actions: z.string().openapi({
      description: "What they do in the video",
      example: "Smiling at the camera",
    }),
  })
  .openapi("VideoCharacter");

export const VideoObjectSchema = z
  .object({
    name: z
      .string()
      .openapi({ description: "Name of the object", example: "coffee cup" }),
    role: z.string().openapi({
      description: "Context of the object use",
      example: "interactive prop",
    }),
    position: z
      .string()
      .openapi({ description: "Where it is located", example: "center table" }),
    description: z.string().openapi({
      description: "Look of the object",
      example: "White ceramic mug",
    }),
  })
  .openapi("VideoObject");

export const CameraMovementSchema = z
  .object({
    type: z
      .string()
      .openapi({ description: "Type of camera motion", example: "dolly" }),
    direction: z
      .string()
      .openapi({ description: "Direction of movement", example: "forward" }),
    speed: z
      .string()
      .openapi({ description: "Speed of movement", example: "slow" }),
    startTime: z
      .string()
      .openapi({ description: "When it starts", example: "0:01" }),
    endTime: z
      .string()
      .openapi({ description: "When it ends", example: "0:05" }),
  })
  .openapi("CameraMovement");

export const VideoTransitionSchema = z
  .object({
    type: z
      .string()
      .openapi({ description: "Type of transition", example: "cut" }),
    timestamp: z
      .string()
      .openapi({ description: "When it happens", example: "0:03" }),
  })
  .openapi("VideoTransition");

export const VideoAudioSchema = z
  .object({
    music: z
      .string()
      .openapi({ description: "Music description", example: "Upbeat Lo-fi" }),
    speech: z
      .string()
      .openapi({ description: "Any spoken words", example: "None" }),
    effects: z
      .string()
      .openapi({ description: "Sound effects", example: "Birds chirping" }),
    mood: z
      .string()
      .openapi({ description: "Aural atmosphere", example: "Relaxing" }),
  })
  .openapi("VideoAudio");

export const TextOverlaySchema = z
  .object({
    text: z.string().openapi({
      description: "Content of the text",
      example: "Morning Vibes",
    }),
    timestamp: z
      .string()
      .openapi({ description: "When it appears", example: "0:01" }),
    position: z
      .string()
      .openapi({ description: "Screen position", example: "top center" }),
    style: z.string().openapi({
      description: "Visual style of text",
      example: "Bold Sans-serif",
    }),
  })
  .openapi("TextOverlay");

export const AnalysisSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique analysis UUID",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    subject: z.string().openapi({
      description: "Main subject of the video",
      example: "A peaceful morning routine",
    }),
    action: z.string().openapi({
      description: "Primary action happening",
      example: "Preparing coffee",
    }),
    environment: z.string().openapi({
      description: "Setting of the video",
      example: "Sunlit kitchen",
    }),
    cameraStyle: z.string().openapi({
      description: "Overall camera vibe",
      example: "Cinematic, handheld",
    }),
    mood: z
      .string()
      .openapi({ description: "Emotional tone", example: "Calm" }),
    colorPalette: z.string().openapi({
      description: "Dominant colors",
      example: "Warm ambers and whites",
    }),
    style: z.string().openapi({ description: "Visual genre", example: "Vlog" }),
    duration: z
      .number()
      .nullable()
      .openapi({ description: "Video length in seconds", example: 15.5 }),
    aspectRatio: z
      .string()
      .openapi({ description: "Screen ratio", example: "9:16" }),
    scenes: z.array(VideoSceneSchema),
    characters: z.array(VideoCharacterSchema),
    objects: z.array(VideoObjectSchema),
    cameraMovements: z.array(CameraMovementSchema),
    lighting: z.string().openapi({
      description: "Lighting conditions",
      example: "Natural morning light",
    }),
    transitions: z.array(VideoTransitionSchema),
    audio: VideoAudioSchema,
    textOverlays: z.array(TextOverlaySchema),
    klingPrompt: z.string().openapi({
      description: "Optimized prompt for Kling AI",
      example: "Cinematic shot of a woman in a sunlit kitchen...",
    }),
    tags: z
      .array(z.string())
      .openapi({ example: ["vlog", "coffee", "morning"] }),
  })
  .openapi("VideoAnalysis");

export const TemplateSchema = z
  .object({
    id: z.string().openapi({
      description: "Template UUID or Reel ID",
      example: "C8ABC123",
    }),
    title: z.string().optional().openapi({
      description: "Human friendly title",
      example: "Aesthetic Morning Routine",
    }),
    tags: z.array(z.string()).openapi({ example: ["minimalist", "modern"] }),
    category: z
      .string()
      .nullable()
      .openapi({ description: "Content category", example: "Lifestyle" }),
    generationCount: z.number().openapi({
      description: "Total videos generated using this template",
      example: 142,
    }),
    isPublished: z
      .boolean()
      .openapi({ description: "Whether it's visible to public" }),
    createdAt: z.string().openapi({
      description: "ISO creation date",
      example: "2023-08-01T12:00:00Z",
    }),
    updatedAt: z.string().openapi({
      description: "ISO last update date",
      example: "2023-08-01T12:30:00Z",
    }),
  })
  .openapi("Template");
