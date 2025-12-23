const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Types
export type AssetCategory = "background" | "character" | "object" | "texture";
export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export type GeneratedAsset = {
  id: string;
  url: string;
  prompt: string;
  category: AssetCategory;
  width?: number;
  height?: number;
};

export type GenerateAssetParams = {
  prompt: string;
  category: AssetCategory;
  aspectRatio?: AspectRatio;
  style?: string;
};

export type GenerateAssetResponse = {
  success: boolean;
  asset: GeneratedAsset;
};

export type CategoryInfo = {
  id: string;
  label: string;
  description: string;
  examples: string[];
};

export type CategoriesResponse = {
  categories: CategoryInfo[];
};

export type StylePreset = {
  id: string;
  label: string;
  description: string;
};

export type StylePresetsResponse = {
  styles: StylePreset[];
};

// API functions

/**
 * Generate an asset image using Imagen AI
 */
export async function generateAsset(
  params: GenerateAssetParams
): Promise<GenerateAssetResponse> {
  const response = await fetch(`${API_URL}/api/assets/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate asset");
  }

  return response.json();
}

/**
 * Get available asset categories with examples
 */
export async function getCategories(): Promise<CategoriesResponse> {
  const response = await fetch(`${API_URL}/api/assets/categories`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get categories");
  }

  return response.json();
}

/**
 * Get available style presets
 */
export async function getStylePresets(): Promise<StylePresetsResponse> {
  const response = await fetch(`${API_URL}/api/assets/styles`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get style presets");
  }

  return response.json();
}
