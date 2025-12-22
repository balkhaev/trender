import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { playwrightClient } from "../playwright-client";
import {
  type Cookie,
  getCookiesFromDb,
  getStateFromDb,
  type StorageState,
  saveState as saveStateToDb,
} from "./credentials";
import type { Reel, ScraperConfig } from "./types";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "../../../data");
const COOKIES_PATH = join(DATA_DIR, "cookies.json");

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

async function loadCookies(): Promise<Cookie[]> {
  // Try to load from database first
  try {
    const dbCookies = await getCookiesFromDb();
    if (dbCookies && dbCookies.length > 0) {
      console.log(`Loaded ${dbCookies.length} cookies from database`);
      return dbCookies;
    }
  } catch (error) {
    console.error("Failed to load cookies from database:", error);
  }

  // Fallback to file
  if (!existsSync(COOKIES_PATH)) {
    console.log("No cookies found in database or file");
    return [];
  }

  try {
    const cookiesData = readFileSync(COOKIES_PATH, "utf-8");
    const cookies = JSON.parse(cookiesData) as Cookie[];
    console.log(`Loaded ${cookies.length} cookies from file (fallback)`);
    return cookies;
  } catch (error) {
    console.error("Failed to load cookies from file:", error);
    return [];
  }
}

async function loadStorageState(): Promise<StorageState | undefined> {
  try {
    const state = await getStateFromDb();
    if (state) {
      console.log("Loaded storage state from database");
      return state as StorageState;
    }
  } catch (error) {
    console.error("Failed to load state from database:", error);
  }
  return;
}

export async function scrapeReels(
  config: ScraperConfig,
  _onProgress?: (update: ProgressUpdate) => void
): Promise<Reel[]> {
  console.log("Using Playwright service for scraping...");

  // Check if playwright service is available
  const isHealthy = await playwrightClient.health();
  if (!isHealthy) {
    throw new Error(
      "Playwright service is not available. Please ensure it is running."
    );
  }

  // Load cookies and state
  const cookies = await loadCookies();
  const storageState = await loadStorageState();

  // Call playwright service
  const result = await playwrightClient.scrapeReels(
    {
      limit: config.limit,
      sortMode: config.sortMode,
      minLikes: config.minLikes,
    },
    cookies,
    storageState
  );

  if (!result.success) {
    throw new Error(result.error ?? "Scraping failed");
  }

  // Save updated storage state
  if (result.storageState) {
    await saveStateToDb(result.storageState).catch((e: unknown) =>
      console.error("Failed to save state to DB:", e)
    );
  }

  console.log(
    `Scraped ${result.reels?.length ?? 0} reels via Playwright service`
  );
  return result.reels ?? [];
}

/**
 * Launch browser for manual login - not available via service
 * Use the playwright service directly for this functionality
 */
export function launchLoginBrowser(): Promise<void> {
  return Promise.reject(
    new Error(
      "Manual login is not supported via Playwright service. " +
        "Please use the playwright service directly or set up cookies via API."
    )
  );
}

export function testConnection(): Promise<boolean> {
  return playwrightClient.testConnection();
}

export function getCookiesPath(): string {
  return COOKIES_PATH;
}

export function getSessionPath(): string {
  return join(DATA_DIR, "playwright", "state.json");
}
