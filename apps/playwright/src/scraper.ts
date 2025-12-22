import { type Browser, chromium, type Page, type Response } from "playwright";
import type {
  CookieParam,
  ProgressUpdate,
  Reel,
  ScraperConfig,
  StorageState,
} from "./types";

const HEADLESS = true;

const SCROLL_DELAY_MIN = 800;
const SCROLL_DELAY_MAX = 1500;
const MAX_SCROLL_ATTEMPTS = 100;
const DEFAULT_MIN_LIKES = 100_000;

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Regex for pure numbers like "168", "5,256", "22 400"
const LIKE_REGEX_STR = "^\\d[\\d\\s,.]*$";
// Regex for numbers with K/M suffix like "11K", "22.4K", "2M", "1.5M"
const LIKE_WITH_SUFFIX_REGEX_STR = "^\\d+[\\d.,]*\\s*[KM]$";
// Regex for Russian formats like "11 тыс", "1.5 млн", "11 тыс."
const LIKE_RUSSIAN_REGEX_STR = "^\\d+[.,\\d]*\\s*(тыс|млн)\\.?$";

function parseLikeCount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "").toLowerCase();

  if (cleaned.endsWith("k")) {
    return Math.round(Number.parseFloat(cleaned.replace("k", "")) * 1000);
  }
  if (cleaned.endsWith("m")) {
    return Math.round(Number.parseFloat(cleaned.replace("m", "")) * 1_000_000);
  }
  if (cleaned.includes("тыс")) {
    return Math.round(
      Number.parseFloat(cleaned.replace("тыс", "").replace(".", "")) * 1000
    );
  }
  if (cleaned.includes("млн")) {
    return Math.round(
      Number.parseFloat(cleaned.replace("млн", "").replace(".", "")) * 1_000_000
    );
  }

  return Number.parseInt(cleaned, 10) || 0;
}

type CollectedReel = {
  id: string;
  url: string;
  likeCount: number;
  viewCount?: number;
  commentCount?: number;
  caption?: string;
  author?: string;
  thumbnailUrl?: string;
  duration?: number;
};

type ReelMetadata = {
  id: string;
  caption?: string;
  author?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const REEL_URL_REGEX = /\/reels?\/([^/?]+)/;

function findActiveContainerLikes(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ pureNumberRegex, suffixRegex, russianRegex }) => {
      const likeRegex = new RegExp(pureNumberRegex);
      const likeSuffixRegex = new RegExp(suffixRegex);
      const likeRussianRegex = new RegExp(russianRegex);
      const results: string[] = [];
      const vh = window.innerHeight;
      const buttons = document.querySelectorAll("button, span");

      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        if (rect.top < 0 || rect.top > vh) {
          continue;
        }
        const text = btn.textContent?.trim() || "";
        if (text.length === 0 || text.length > 25) {
          continue;
        }
        const isLike =
          likeRegex.test(text) ||
          likeSuffixRegex.test(text) ||
          likeRussianRegex.test(text);
        if (isLike) {
          results.push(text);
        }
      }
      return results;
    },
    {
      pureNumberRegex: LIKE_REGEX_STR,
      suffixRegex: LIKE_WITH_SUFFIX_REGEX_STR,
      russianRegex: LIKE_RUSSIAN_REGEX_STR,
    }
  );
}

async function extractLikeTextFromPage(page: Page): Promise<string> {
  const candidates = await findActiveContainerLikes(page);
  return candidates[0] || "";
}

function getCurrentReelId(url: string): string | null {
  const match = url.match(REEL_URL_REGEX);
  return match?.[1] ?? null;
}

function extractReelMetadatasFromGraphQlPayload(
  payload: JsonValue
): ReelMetadata[] {
  const results: ReelMetadata[] = [];

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: GraphQL payload extraction requires nested traversal
  function traverse(obj: JsonValue): void {
    if (obj === null || typeof obj !== "object") {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        traverse(item);
      }
      return;
    }

    const record = obj as Record<string, JsonValue>;

    // Look for media objects with shortcode (reel ID)
    if (
      typeof record.shortcode === "string" &&
      (record.__typename === "XDTGraphVideo" ||
        record.__typename === "GraphVideo" ||
        record.is_video === true)
    ) {
      const meta: ReelMetadata = {
        id: record.shortcode,
        caption:
          typeof record.caption === "string"
            ? record.caption
            : extractCaption(record),
        author: extractAuthor(record),
        thumbnailUrl: extractThumbnail(record),
        viewCount: extractNumber(record.video_view_count ?? record.play_count),
        likeCount: extractNumber(
          record.like_count ?? (record.edge_media_preview_like as JsonValue)
        ),
        commentCount: extractNumber(
          record.comment_count ??
            (record.edge_media_to_parent_comment as JsonValue)
        ),
        duration: extractNumber(record.video_duration),
      };
      results.push(meta);
    }

    for (const value of Object.values(record)) {
      traverse(value);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Instagram GraphQL caption extraction
  function extractCaption(
    record: Record<string, JsonValue>
  ): string | undefined {
    const edges = record.edge_media_to_caption;
    if (
      edges &&
      typeof edges === "object" &&
      !Array.isArray(edges) &&
      Array.isArray((edges as Record<string, JsonValue>).edges)
    ) {
      const edgeArr = (edges as Record<string, JsonValue>).edges as JsonValue[];
      if (
        edgeArr[0] &&
        typeof edgeArr[0] === "object" &&
        !Array.isArray(edgeArr[0])
      ) {
        const node = (edgeArr[0] as Record<string, JsonValue>).node;
        if (node && typeof node === "object" && !Array.isArray(node)) {
          const text = (node as Record<string, JsonValue>).text;
          if (typeof text === "string") {
            return text;
          }
        }
      }
    }
    return;
  }

  function extractAuthor(
    record: Record<string, JsonValue>
  ): string | undefined {
    const owner = record.owner;
    if (owner && typeof owner === "object" && !Array.isArray(owner)) {
      const username = (owner as Record<string, JsonValue>).username;
      if (typeof username === "string") {
        return username;
      }
    }
    return;
  }

  function extractThumbnail(
    record: Record<string, JsonValue>
  ): string | undefined {
    if (typeof record.thumbnail_src === "string") {
      return record.thumbnail_src;
    }
    if (typeof record.display_url === "string") {
      return record.display_url;
    }
    return;
  }

  function extractNumber(value: JsonValue): number | undefined {
    if (typeof value === "number") {
      return value;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const count = (value as Record<string, JsonValue>).count;
      if (typeof count === "number") {
        return count;
      }
    }
    return;
  }

  traverse(payload);
  return results;
}

type ProcessReelContext = {
  page: Page;
  minLikes: number;
  collectedReels: Map<string, CollectedReel>;
  metadataById: Map<string, ReelMetadata>;
  maxReels: number;
  scannedCount: number;
  onProgress?: (update: ProgressUpdate) => void;
};

type ProcessReelResult = {
  reelId: string | null;
  likeCount: number;
  passed: boolean;
};

async function processCurrentReel(
  ctx: ProcessReelContext
): Promise<ProcessReelResult> {
  const currentUrl = ctx.page.url();
  const currentReelId = getCurrentReelId(currentUrl);

  if (!currentReelId) {
    return { reelId: null, likeCount: 0, passed: false };
  }

  const meta = ctx.metadataById.get(currentReelId);

  const likeText = await extractLikeTextFromPage(ctx.page);
  const likeFromDom = parseLikeCount(likeText);
  const likeCount = meta?.likeCount ?? likeFromDom;
  const passed = likeCount >= ctx.minLikes;

  console.log(
    `Reel ${currentReelId}: "${likeText}" -> ${likeCount} ${passed ? "✓" : "✗"}`
  );

  let lastFoundReel: { id: string; likes: number } | undefined;

  if (passed && !ctx.collectedReels.has(currentReelId)) {
    ctx.collectedReels.set(currentReelId, {
      id: currentReelId,
      url: currentUrl,
      likeCount,
      viewCount: meta?.viewCount,
      commentCount: meta?.commentCount,
      caption: meta?.caption,
      author: meta?.author,
      thumbnailUrl: meta?.thumbnailUrl,
      duration: meta?.duration,
    });
    console.log(`  Added! Total: ${ctx.collectedReels.size}/${ctx.maxReels}`);
    lastFoundReel = { id: currentReelId, likes: likeCount };
  }

  ctx.onProgress?.({
    scanned: ctx.scannedCount,
    found: ctx.collectedReels.size,
    currentReelId,
    currentLikes: likeCount,
    lastFoundReel,
  });

  return { reelId: currentReelId, likeCount, passed };
}

async function scrollAndCollectReelsFromFeed(
  page: Page,
  maxReels: number,
  minLikes: number,
  onProgress?: (update: ProgressUpdate) => void
): Promise<CollectedReel[]> {
  const collectedReels = new Map<string, CollectedReel>();
  const metadataById = new Map<string, ReelMetadata>();
  let scrollAttempts = 0;
  let noNewContentCount = 0;
  let lastReelId = "";
  let scannedCount = 0;

  console.log(
    `Starting reel collection for up to ${maxReels} reels with ${minLikes}+ likes...`
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Response handler for GraphQL metadata extraction
  const responseHandler = async (response: Response) => {
    const url = response.url();
    if (!(url.includes("/graphql/") || url.includes("graphql/query"))) {
      return;
    }

    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("application/json")) {
      return;
    }

    try {
      const payload = (await response.json()) as JsonValue;
      const metadatas = extractReelMetadatasFromGraphQlPayload(payload);
      if (metadatas.length === 0) {
        return;
      }

      for (const m of metadatas) {
        const prev = metadataById.get(m.id);
        metadataById.set(m.id, {
          id: m.id,
          caption: m.caption ?? prev?.caption,
          author: m.author ?? prev?.author,
          thumbnailUrl: m.thumbnailUrl ?? prev?.thumbnailUrl,
          viewCount: m.viewCount ?? prev?.viewCount,
          likeCount: m.likeCount ?? prev?.likeCount,
          commentCount: m.commentCount ?? prev?.commentCount,
          duration: m.duration ?? prev?.duration,
        });
      }
    } catch {
      // ignore parse errors
    }
  };

  page.on("response", responseHandler);

  try {
    try {
      await page.waitForSelector("video", { timeout: 10_000 });
      await sleep(500);

      const video = page.locator("video").first();
      await video.click({ force: true }).catch(() => {
        console.log("Could not click video, trying page click");
      });
      await sleep(300);
    } catch {
      console.log("No video found, starting navigation anyway");
    }

    while (
      collectedReels.size < maxReels &&
      scrollAttempts < MAX_SCROLL_ATTEMPTS
    ) {
      scannedCount += 1;

      const result = await processCurrentReel({
        page,
        minLikes,
        collectedReels,
        metadataById,
        maxReels,
        scannedCount,
        onProgress,
      });

      if (result.reelId && result.reelId !== lastReelId) {
        lastReelId = result.reelId;
        noNewContentCount = 0;
      } else {
        noNewContentCount += 1;
        if (noNewContentCount >= 10) {
          console.log("No new reels after 10 scroll attempts, stopping...");
          break;
        }
      }

      scrollAttempts += 1;

      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await sleep(200);

      await page.keyboard.press("ArrowDown");
      await sleep(randomDelay(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));
    }
  } finally {
    page.off("response", responseHandler);
  }

  console.log(`Collected ${collectedReels.size} reels with ${minLikes}+ likes`);
  return Array.from(collectedReels.values());
}

async function checkLoginStatus(page: Page): Promise<boolean> {
  const isLoggedIn = await page.evaluate(() => {
    const loginRequired =
      document.body.innerText.includes("Log in") &&
      document.body.innerText.includes("Sign up");
    const hasLoginButton =
      document.querySelector('a[href*="/accounts/login"]') !== null;

    const hasProfileLink =
      document.querySelector('a[href*="/direct/"]') !== null ||
      document.querySelector('svg[aria-label="Home"]') !== null ||
      document.querySelector('a[href*="/accounts/edit/"]') !== null;

    return hasProfileLink || !(loginRequired || hasLoginButton);
  });

  return isLoggedIn;
}

export type ScrapeResult = {
  success: boolean;
  reels: Reel[];
  storageState?: StorageState;
  error?: string;
};

export async function scrapeReels(
  config: ScraperConfig,
  cookies?: CookieParam[],
  storageState?: StorageState,
  onProgress?: (update: ProgressUpdate) => void
): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  const minLikes = config.minLikes ?? DEFAULT_MIN_LIKES;

  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      storageState,
    });

    if (cookies && cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`Loaded ${cookies.length} cookies`);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    page.setDefaultNavigationTimeout(90_000);

    const targetUrl = "https://www.instagram.com/reels/";
    console.log(`Navigating to: ${targetUrl}`);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForLoadState("load").catch(() => {
      // Ignore timeout - page may be partially loaded
    });
    await sleep(2000);

    const isLoggedIn = await checkLoginStatus(page);
    if (!isLoggedIn) {
      console.error("Not logged in to Instagram!");
      const finalState = await context.storageState();
      await browser.close();
      return {
        success: false,
        reels: [],
        storageState: finalState,
        error: "Instagram login required. Please provide valid cookies.",
      };
    }

    console.log("Logged in successfully!");
    console.log(
      `Collecting up to ${config.limit} reels with ${minLikes}+ likes...`
    );

    const collectedReels = await scrollAndCollectReelsFromFeed(
      page,
      config.limit,
      minLikes,
      onProgress
    );

    console.log(
      `Collected ${collectedReels.length} reels with ${minLikes}+ likes`
    );

    const reels: Reel[] = collectedReels.map((r) => ({
      id: r.id,
      url: r.url,
      videoUrl: "",
      likeCount: r.likeCount,
      viewCount: r.viewCount,
      commentCount: r.commentCount,
      caption: r.caption,
      author: r.author,
      thumbnailUrl: r.thumbnailUrl,
      duration: r.duration,
    }));

    const finalState = await context.storageState();
    await browser.close();

    return {
      success: true,
      reels,
      storageState: finalState,
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      reels: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testConnection(): Promise<boolean> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: HEADLESS });
    const page = await browser.newPage();
    await page.goto("https://www.instagram.com", { timeout: 30_000 });
    await browser.close();
    return true;
  } catch {
    if (browser) {
      await browser.close();
    }
    return false;
  }
}
