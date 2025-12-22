export type SortMode = "top" | "recent";

export type Reel = {
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

export type ScraperConfig = {
  limit: number;
  sortMode: SortMode;
  minLikes?: number;
};

export type ProgressUpdate = {
  scanned: number;
  found: number;
  currentReelId?: string;
  currentLikes?: number;
  lastFoundReel?: {
    id: string;
    likes: number;
  };
};

export type ScrapeRequest = {
  limit?: number;
  sort?: SortMode;
  minLikes?: number;
  cookies?: CookieParam[];
  storageState?: StorageState;
};

export type CookieParam = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type StorageState = {
  cookies: CookieParam[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

export type ScrapeResponse = {
  success: boolean;
  reels?: Reel[];
  storageState?: StorageState;
  error?: string;
};
