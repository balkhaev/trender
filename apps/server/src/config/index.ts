/**
 * Centralized configuration module
 * All environment variables are collected here with defaults
 */

// =============================================================================
// External Services
// =============================================================================

export const services = {
  /** Instaloader/Scrapper service URL */
  scrapper:
    process.env.SCRAPPER_SERVICE_URL ||
    process.env.INSTALOADER_SERVICE_URL ||
    "http://localhost:8001",

  /** Video frames processing service URL */
  videoFrames: process.env.VIDEO_FRAMES_SERVICE_URL || "http://localhost:8002",

  /** Playwright browser automation service URL */
  playwright: process.env.PLAYWRIGHT_SERVICE_URL || "http://localhost:3002",

  /** Public URL for this server (for external access) */
  publicUrl: process.env.PUBLIC_URL || "http://localhost:3000",
} as const;

// =============================================================================
// AI Providers
// =============================================================================

export const ai = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    isConfigured: () => !!process.env.GEMINI_API_KEY,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    isConfigured: () => !!process.env.OPENAI_API_KEY,
  },
  kling: {
    accessKey: process.env.KLING_ACCESS_KEY || "",
    secretKey: process.env.KLING_SECRET_KEY || "",
    apiUrl: process.env.KLING_API_URL || "https://api-singapore.klingai.com/v1",
    isConfigured: () =>
      !!(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY),
  },
} as const;

// =============================================================================
// Storage
// =============================================================================

export const s3 = {
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  accessKey: process.env.S3_ACCESS_KEY || "",
  secretKey: process.env.S3_SECRET_KEY || "",
  bucket: process.env.S3_BUCKET || "trender",
  region: process.env.S3_REGION || "us-east-1",
  isConfigured: () =>
    !!(
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_ENDPOINT
    ),
} as const;

export const redis = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
} as const;

// =============================================================================
// Paths & Directories
// =============================================================================

import { join } from "node:path";

const defaultDataDir = join(import.meta.dir, "../../data");

export const paths = {
  /** Data directory for local storage */
  dataDir: process.env.DATA_DIR || defaultDataDir,
  /** Downloads subdirectory */
  get downloadsDir() {
    return join(this.dataDir, "downloads");
  },
} as const;

// =============================================================================
// Video Processing
// =============================================================================

export const video = {
  /** Frame extraction interval in seconds */
  frameIntervalSec: Number.parseFloat(process.env.FRAME_INTERVAL_SEC || "2.0"),
} as const;

// =============================================================================
// Timeouts
// =============================================================================

export const timeouts = {
  /** Max time to wait for Gemini file processing (ms) */
  geminiProcessing: 5 * 60 * 1000, // 5 минут
  /** Max time for Gemini API call (ms) */
  geminiApi: 3 * 60 * 1000, // 3 минуты
  /** Max time for OpenAI API call (ms) */
  openaiApi: 2 * 60 * 1000, // 2 минуты
} as const;

// =============================================================================
// Server
// =============================================================================

export const server = {
  corsOrigin: process.env.CORS_ORIGIN || "",
  jwtSecret: process.env.BETTER_AUTH_SECRET || "fallback-secret-for-dev",
  logLevel: (process.env.LOG_LEVEL || "info") as
    | "debug"
    | "info"
    | "warn"
    | "error",
} as const;

// =============================================================================
// Full config export
// =============================================================================

export const config = {
  services,
  ai,
  s3,
  redis,
  paths,
  video,
  server,
  timeouts,
} as const;

export default config;
