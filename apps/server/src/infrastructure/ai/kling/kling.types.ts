export type KlingGenerationResult = {
  success: boolean;
  videoUrl?: string;
  taskId?: string;
  error?: string;
};

/**
 * Image element for Kling multi-image reference
 * Used for subjects/characters with @Element1, @Element2 syntax
 */
export type KlingImageElement = {
  referenceImageUrls: string[];
  frontalImageUrl?: string;
};

/**
 * Callback for tracking Kling generation progress
 */
export type KlingProgressCallback = (
  status: KlingTaskStatus,
  progress: number | undefined,
  message: string
) => void | Promise<void>;

export type KlingGenerationOptions = {
  duration?: number; // 1-10 seconds
  aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
  keepAudio?: boolean;
  negativePrompt?: string;
  mode?: "std" | "pro";
  /** Image URLs for @Image1, @Image2... references (style, background) */
  imageUrls?: string[];
  /** Elements for @Element1, @Element2... references (subjects/characters) */
  elements?: KlingImageElement[];
  /** Callback for generation progress updates */
  onProgress?: KlingProgressCallback;
  /** Generation ID for logging */
  generationId?: string;
  /** Reel ID for logging */
  reelId?: string;
};

// API Response types
export type KlingTaskCreateResponse = {
  code: number;
  message: string;
  data?: {
    task_id: string;
  };
};

// Official Kling API statuses: submitted, processing, succeed, failed
export type KlingApiStatus = "submitted" | "processing" | "succeed" | "failed";

// Internal normalized status for callbacks
export type KlingTaskStatus = "pending" | "processing" | "completed" | "failed";

export type KlingTaskStatusResponse = {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: KlingApiStatus;
    task_status_msg?: string;
    task_result?: {
      videos?: {
        id: string;
        url: string;
        duration: string;
      }[];
    };
  };
};

/**
 * Response type for /account/costs endpoint
 */
export type KlingAccountCostsResponse = {
  code: number;
  message: string;
  request_id: string;
  data?: {
    code: number;
    msg: string;
    resource_pack_subscribe_infos: {
      resource_pack_name: string;
      resource_pack_id: string;
      resource_pack_type: "decreasing_total" | "constant_period";
      total_quantity: number;
      remaining_quantity: number;
      purchase_time: number;
      effective_time: number;
      invalid_time: number;
      status: "toBeOnline" | "online" | "expired" | "runOut";
    }[];
  };
};

export type KlingBalanceResult = {
  remainingTokens: number;
  error?: string;
};

// Request body type for video generation
export type KlingVideoRequestBody = {
  model_name: string;
  prompt: string;
  negative_prompt?: string;
  video_list: {
    video_url: string;
    refer_type: string;
    keep_original_sound: string;
  }[];
  image_list?: { image_url: string }[];
  mode: string;
  aspect_ratio?: string;
  duration?: string;
};
