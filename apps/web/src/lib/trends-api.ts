import { API_URL } from "./api-client";

export type TagTrend = {
  tag: string;
  score: number;
  frequency: number;
};

export type TagTrendsResponse = {
  windowHours: number;
  videosAnalyzed: number;
  tags: TagTrend[];
};

export async function getTagTrends(params?: {
  hours?: number;
  limit?: number;
}): Promise<TagTrendsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.hours) {
    searchParams.set("hours", params.hours.toString());
  }
  if (params?.limit) {
    searchParams.set("limit", params.limit.toString());
  }

  const url = `${API_URL}/api/trends/tags?${searchParams.toString()}`;
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    throw new Error("Failed to get tag trends");
  }

  return response.json();
}
