import type { Page } from "@playwright/test";

type ReelStatus =
  | "scraped"
  | "downloading"
  | "downloaded"
  | "analyzing"
  | "analyzed"
  | "failed";

type ReelStats = {
  total: number;
  byStatus: Record<ReelStatus, number>;
  templates: number;
  activeGenerations: number;
};

type SavedReel = {
  id: string;
  url: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  hashtag: string | null;
  source: string;
  status: ReelStatus;
  localPath: string | null;
  errorMessage: string | null;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
  analysis: null;
};

type SavedReelsResponse = {
  reels: SavedReel[];
  total: number;
  limit: number;
  offset: number;
};

type TemplatesListResponse = {
  templates: {
    id: string;
    title: string | null;
    tags: string[];
    category: string | null;
    generationCount: number;
    isPublished: boolean;
    createdAt: string;
    updatedAt: string;
    reel: {
      id: string;
      url: string;
      thumbnailUrl: string | null;
      likeCount: number | null;
      author: string | null;
      source: string;
    };
    analysis: {
      id: string;
      subject: string;
      action: string;
      style: string;
      veo3Prompt: string;
    };
  }[];
  total: number;
  limit: number;
  offset: number;
};

type ReelDebugInfo = {
  reel: {
    id: string;
    url: string;
    status: ReelStatus;
    likeCount: number | null;
    source: string;
    localPath: string | null;
    errorMessage: string | null;
    scrapedAt: string;
    updatedAt: string;
  };
  logs: {
    id: string;
    reelId: string;
    level: "debug" | "info" | "warn" | "error";
    stage: string;
    message: string;
    metadata: null;
    duration: number | null;
    createdAt: string;
  }[];
  stageStats: {
    stage: string;
    count: number;
    totalDuration: number;
    errors: number;
  }[];
  recentErrors: {
    id: string;
    reelId: string;
    level: "debug" | "info" | "warn" | "error";
    stage: string;
    message: string;
    metadata: null;
    duration: number | null;
    createdAt: string;
  }[];
  template: null;
  generations: {
    id: string;
    provider: string;
    status: string;
    prompt: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  }[];
};

export async function disableMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "*{transition:none!important;animation:none!important}html{scroll-behavior:auto!important}",
  });
}

export async function mockApiForHome(page: Page): Promise<void> {
  const now = new Date("2025-12-15T00:00:00.000Z").toISOString();

  const stats: ReelStats = {
    total: 1,
    byStatus: {
      scraped: 1,
      downloading: 0,
      downloaded: 0,
      analyzing: 0,
      analyzed: 0,
      failed: 0,
    },
    templates: 0,
    activeGenerations: 0,
  };

  const reels: SavedReelsResponse = {
    reels: [
      {
        id: "test-reel",
        url: "https://instagram.com/reel/test-reel",
        videoUrl: null,
        thumbnailUrl: null,
        caption: null,
        author: null,
        viewCount: null,
        likeCount: 1234,
        commentCount: null,
        hashtag: null,
        source: "reels",
        status: "scraped",
        localPath: null,
        errorMessage: null,
        scrapedAt: now,
        createdAt: now,
        updatedAt: now,
        analysis: null,
      },
    ],
    total: 1,
    limit: 200,
    offset: 0,
  };

  const templates: TemplatesListResponse = {
    templates: [],
    total: 0,
    limit: 20,
    offset: 0,
  };

  await page.route("**/api/reels/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stats),
    });
  });

  await page.route("**/api/reels/saved**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reels),
    });
  });

  await page.route("**/api/reels/jobs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/templates?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(templates),
    });
  });

  // Defensive: if anything tries to mutate pipeline, return OK.
  await page.route("**/api/reels/*/process", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "job-test" }),
    });
  });
  await page.route("**/api/reels/*/download", async (route) => {
    await route.fulfill({ status: 200 });
  });
  await page.route("**/api/reels/*/analyze", async (route) => {
    await route.fulfill({ status: 200 });
  });
}

type TagTrend = {
  tag: string;
  score: number;
  frequency: number;
};

type TagTrendsResponse = {
  windowHours: number;
  videosAnalyzed: number;
  tags: TagTrend[];
};

export async function mockApiForIdea(page: Page): Promise<void> {
  const response: TagTrendsResponse = {
    windowHours: 24,
    videosAnalyzed: 123,
    tags: [
      { tag: "food", score: 120, frequency: 80 },
      { tag: "street-food", score: 110, frequency: 70 },
      { tag: "fitness", score: 100, frequency: 65 },
      { tag: "travel", score: 95, frequency: 60 },
      { tag: "cinematic", score: 90, frequency: 55 },
      { tag: "diy", score: 75, frequency: 40 },
      { tag: "tutorial", score: 70, frequency: 38 },
      { tag: "pets", score: 60, frequency: 30 },
      { tag: "dance", score: 55, frequency: 28 },
      { tag: "asmr", score: 50, frequency: 25 },
    ],
  };

  await page.route("**/api/trends/tags**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

export async function mockApiForReel(
  page: Page,
  reelId: string
): Promise<void> {
  const now = new Date("2025-12-15T00:00:00.000Z").toISOString();

  const debugInfo: ReelDebugInfo = {
    reel: {
      id: reelId,
      url: `https://instagram.com/reel/${reelId}`,
      status: "scraped",
      likeCount: 1234,
      source: "reels",
      localPath: null,
      errorMessage: null,
      scrapedAt: now,
      updatedAt: now,
    },
    logs: [],
    stageStats: [],
    recentErrors: [],
    template: null,
    generations: [],
  };

  await page.route(`**/api/reels/${reelId}/debug`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(debugInfo),
    });
  });

  await page.route(`**/api/reels/${reelId}/logs**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ logs: [] }),
    });
  });

  await page.route("**/api/templates/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  // Defensive: if user clicks action buttons.
  await page.route(`**/api/reels/${reelId}/process`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "job-test" }),
    });
  });
  await page.route(`**/api/reels/${reelId}/download`, async (route) => {
    await route.fulfill({ status: 200 });
  });
  await page.route(`**/api/reels/${reelId}/analyze`, async (route) => {
    await route.fulfill({ status: 200 });
  });
}
