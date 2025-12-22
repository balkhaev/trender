import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Browser } from "playwright";
import { scrapeReels, testConnection } from "./scraper";
import type { ScrapeRequest, ScrapeResponse } from "./types";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", service: "playwright" }));

// Test Instagram connection
app.get("/test", async (c) => {
  const connected = await testConnection();
  return c.json({ connected });
});

// Scrape Instagram reels
app.post("/scrape", async (c) => {
  const body = await c.req.json<ScrapeRequest>();

  const config = {
    limit: body.limit ?? 10,
    sortMode: body.sort ?? "top",
    minLikes: body.minLikes ?? 100_000,
  };

  console.log("Starting scrape with config:", config);

  const result = await scrapeReels(config, body.cookies, body.storageState);

  const response: ScrapeResponse = {
    success: result.success,
    reels: result.reels,
    storageState: result.storageState,
    error: result.error,
  };

  return c.json(response);
});

// Screenshot endpoint (useful for debugging)
app.post("/screenshot", async (c) => {
  const { chromium } = await import("playwright");
  const body = await c.req.json<{ url: string; cookies?: unknown[] }>();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    if (body.cookies && Array.isArray(body.cookies)) {
      await context.addCookies(
        body.cookies as Parameters<typeof context.addCookies>[0]
      );
    }

    const page = await context.newPage();
    await page.goto(body.url, { waitUntil: "networkidle", timeout: 30_000 });

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    await browser.close();

    return new Response(screenshot, {
      headers: { "Content-Type": "image/png" },
    });
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});

const port = Number(process.env.PORT) || 3002;

console.log(`Playwright service starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
