import "dotenv/config";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { server } from "./config";
import { tracingMiddleware } from "./middleware/tracing";
import { authRouter } from "./routes/auth";
import { debugRouter } from "./routes/debug";
import { filesRouter } from "./routes/files";
import { pipelineRouter } from "./routes/pipeline";
import { queuesRouter } from "./routes/queues";
import { reelsRouter } from "./routes/reels/index";
import { templatesRouter } from "./routes/templates";
import { trendsRouter } from "./routes/trends";
import { trimRouter } from "./routes/trim";
import { video } from "./routes/video";
import { closeAllQueues, initAllWorkers } from "./services/queues";

// ============================================
// PUBLIC API (клиентский флоу)
// ============================================
const publicApi = new OpenAPIHono();

// Public routes
publicApi.route("/templates", templatesRouter);

const contentRouterModule = await import("./routes/content");
publicApi.route("/content", contentRouterModule.contentRouter);

const mediaRouterModule = await import("./routes/media");
publicApi.route("/media", mediaRouterModule.mediaRouter);

const remixRouterModule = await import("./routes/remix");
publicApi.route("/remix", remixRouterModule.remixRouter);

const generateRouterModule = await import("./routes/generate");
publicApi.route("/generate", generateRouterModule.generateRouter);

// ============================================
// INTERNAL API (админка, дебаг)
// ============================================
const internalApi = new OpenAPIHono();

internalApi.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// Internal routes
internalApi.route("/video", video);
internalApi.route("/reels", reelsRouter);
internalApi.route("/trends", trendsRouter);
internalApi.route("/files", filesRouter);
internalApi.route("/queues", queuesRouter);
internalApi.route("/pipeline", pipelineRouter);
internalApi.route("/trim", trimRouter);
internalApi.route("/debug", debugRouter);
internalApi.route("/v1/auth", authRouter);

const klingRouter = await import("./routes/kling");
internalApi.route("/kling", klingRouter.klingRouter);

// ============================================
// MAIN APP
// ============================================
const app = new OpenAPIHono();

app.use(tracingMiddleware);
app.use(logger());
app.use(
  "/*",
  cors({
    origin: server.corsOrigin,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  })
);

// Health check
app.get("/", (c) => c.text("OK"));

// Mount all routes under /api
app.route("/api", publicApi);
app.route("/api", internalApi);

// ============================================
// OPENAPI DOCUMENTATION
// ============================================

// Public API spec
app.get("/doc/public", (c) => {
  try {
    const document = publicApi.getOpenAPIDocument({
      openapi: "3.0.0",
      info: {
        version: "1.0.0",
        title: "Trender Public API",
        description:
          "Публичное API для клиентского приложения. Документация: docs/api-contracts.md",
      },
      servers: [{ url: "/api", description: "API base path" }],
    });
    return c.json(document);
  } catch (e) {
    console.error("[OpenAPI Public] Error:", e);
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Internal API spec
app.get("/doc/internal", (c) => {
  try {
    const document = internalApi.getOpenAPIDocument({
      openapi: "3.0.0",
      info: {
        version: "1.0.0",
        title: "Trender Internal API",
        description: "Внутреннее API для администрирования и отладки.",
      },
      servers: [{ url: "/api", description: "API base path" }],
    });
    return c.json(document);
  } catch (e) {
    console.error("[OpenAPI Internal] Error:", e);
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Swagger UI
app.get(
  "/reference/public",
  apiReference({
    theme: "purple",
    layout: "modern",
    url: "/doc/public",
  })
);

app.get(
  "/reference/internal",
  apiReference({
    theme: "purple",
    layout: "modern",
    url: "/doc/internal",
  })
);

// Initialize workers on startup
initAllWorkers();

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  try {
    await closeAllQueues();
    console.log("[Server] Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[Server] Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
