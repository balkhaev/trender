/**
 * HTTP client for the Playwright microservice.
 * Replaces direct Playwright usage in the server for Docker optimization.
 */

import type { Cookie, StorageState } from "./instagram/credentials";

type SortMode = "top" | "recent";

type Reel = {
  id: string;
  url: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  author?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
};

type ScrapeRequest = {
  limit?: number;
  sort?: SortMode;
  minLikes?: number;
  cookies?: Cookie[];
  storageState?: StorageState;
};

type ScrapeResponse = {
  success: boolean;
  reels?: Reel[];
  storageState?: StorageState;
  error?: string;
};

const PLAYWRIGHT_SERVICE_URL =
  process.env.PLAYWRIGHT_SERVICE_URL || "http://localhost:3002";

export class PlaywrightClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? PLAYWRIGHT_SERVICE_URL;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (_error) {
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/test`);
      if (!response.ok) {
        return false;
      }
      const data = (await response.json()) as { connected: boolean };
      return data.connected;
    } catch (_error) {
      return false;
    }
  }

  async scrapeReels(
    config: {
      limit: number;
      sortMode: SortMode;
      minLikes?: number;
    },
    cookies?: Cookie[],
    storageState?: StorageState
  ): Promise<ScrapeResponse> {
    const request: ScrapeRequest = {
      limit: config.limit,
      sort: config.sortMode,
      minLikes: config.minLikes,
      cookies,
      storageState,
    };

    const response = await fetch(`${this.baseUrl}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Playwright service error: ${response.status} ${response.statusText}`,
      };
    }

    return response.json() as Promise<ScrapeResponse>;
  }

  async screenshot(
    url: string,
    cookies?: Cookie[]
  ): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(`${this.baseUrl}/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, cookies }),
      });

      if (!response.ok) {
        return null;
      }
      return response.arrayBuffer();
    } catch (_error) {
      return null;
    }
  }
}

// Singleton instance
export const playwrightClient = new PlaywrightClient();
