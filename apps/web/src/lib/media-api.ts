import { API_URL } from "./api-client";

// Types
export type MediaSource = "upload" | "generated";
export type MediaType = "image" | "video";
export type AssetCategory = "background" | "character" | "object" | "texture";

export type MediaItem = {
  id: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  mimeType: string | null;
  createdAt: string;
  source: MediaSource;
  category: string | null;
  prompt: string | null;
  style: string | null;
};

export type PersonalMediaParams = {
  type?: MediaType | "all";
  source?: MediaSource | "all";
  category?: AssetCategory;
  limit?: number;
  offset?: number;
};

export type PersonalMediaResponse = {
  items: MediaItem[];
  total: number;
  limit: number;
  offset: number;
};

export type MediaUploadResponse = {
  success: boolean;
  media: MediaItem;
};

// API functions

/**
 * Get personal media library with filters
 */
export async function getPersonalMedia(
  params: PersonalMediaParams = {}
): Promise<PersonalMediaResponse> {
  const searchParams = new URLSearchParams();

  if (params.type && params.type !== "all") {
    searchParams.set("type", params.type);
  }
  if (params.source && params.source !== "all") {
    searchParams.set("source", params.source);
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }
  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }
  if (params.offset) {
    searchParams.set("offset", params.offset.toString());
  }

  const response = await fetch(
    `${API_URL}/api/media/personal?${searchParams.toString()}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get media library");
  }

  return response.json();
}

/**
 * Upload media file to library
 */
export async function uploadMedia(file: File): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/media/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload media");
  }

  return response.json();
}

/**
 * Delete media from library
 */
export async function deleteMedia(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/media/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete media");
  }

  return response.json();
}
