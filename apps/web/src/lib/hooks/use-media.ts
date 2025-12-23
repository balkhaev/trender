import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CategoriesResponse,
  type GenerateAssetParams,
  type GenerateAssetResponse,
  generateAsset,
  getCategories,
  getStylePresets,
  type StylePresetsResponse,
} from "../assets-api";
import {
  deleteMedia,
  getPersonalMedia,
  type MediaItem,
  type PersonalMediaParams,
  type PersonalMediaResponse,
  uploadMedia,
} from "../media-api";

// ===== Media Library Hooks =====

export function usePersonalMedia(params: PersonalMediaParams = {}) {
  return useQuery<PersonalMediaResponse>({
    queryKey: ["personalMedia", params],
    queryFn: () => getPersonalMedia(params),
  });
}

export function useUploadMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadMedia(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personalMedia"] });
    },
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMedia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personalMedia"] });
    },
  });
}

// ===== Asset Generation Hooks =====

export function useAssetCategories() {
  return useQuery<CategoriesResponse>({
    queryKey: ["assetCategories"],
    queryFn: getCategories,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useStylePresets() {
  return useQuery<StylePresetsResponse>({
    queryKey: ["stylePresets"],
    queryFn: getStylePresets,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useGenerateAsset() {
  const queryClient = useQueryClient();

  return useMutation<GenerateAssetResponse, Error, GenerateAssetParams>({
    mutationFn: (params) => generateAsset(params),
    onSuccess: () => {
      // Invalidate media library to show new generated asset
      queryClient.invalidateQueries({ queryKey: ["personalMedia"] });
    },
  });
}

// ===== Combined Types =====
export type { MediaItem, PersonalMediaParams, PersonalMediaResponse };
export type {
  GenerateAssetParams,
  GenerateAssetResponse,
  CategoriesResponse,
  StylePresetsResponse,
};
