import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AssetCategoriesResponseSchema,
  AssetGenerateRequestSchema,
  AssetGenerateResponseSchema,
  AssetStylePresetsResponseSchema,
  ErrorResponseSchema,
} from "../schemas";
import type { AspectRatio, AssetCategory } from "../services/imagen";
import { getImagenService } from "../services/imagen";
import { validationHook } from "../utils/validation-hook";

const app = new OpenAPIHono({ defaultHook: validationHook });

// ============================================
// POST /generate - Generate asset via Imagen
// ============================================

const generateAssetRoute = createRoute({
  method: "post",
  path: "/generate",
  summary: "Generate asset image",
  tags: ["Assets"],
  description: "Generate an image using Google Imagen AI.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AssetGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AssetGenerateResponseSchema,
        },
      },
      description: "Asset generated successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid request or generation failed",
    },
  },
});

app.openapi(generateAssetRoute, async (c) => {
  try {
    const body = c.req.valid("json");

    // TODO: Get userId from auth session
    const userId = "default-user";

    const imagenService = getImagenService();
    const asset = await imagenService.generateAsset({
      prompt: body.prompt,
      category: body.category as AssetCategory,
      aspectRatio: body.aspectRatio as AspectRatio,
      style: body.style,
      userId,
    });

    return c.json(
      {
        success: true,
        asset: {
          id: asset.id,
          url: asset.url,
          prompt: asset.prompt,
          category: asset.category,
          width: asset.width,
          height: asset.height,
        },
      },
      200
    );
  } catch (error) {
    console.error("Asset generation error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// GET /categories - Get available categories
// ============================================

const getCategoriesRoute = createRoute({
  method: "get",
  path: "/categories",
  summary: "Get asset categories",
  tags: ["Assets"],
  description: "Returns list of available asset categories with examples.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AssetCategoriesResponseSchema,
        },
      },
      description: "Categories list",
    },
  },
});

app.openapi(getCategoriesRoute, (c) => {
  const imagenService = getImagenService();
  const categories = imagenService.getCategories();

  return c.json({ categories });
});

// ============================================
// GET /styles - Get available style presets
// ============================================

const getStylesRoute = createRoute({
  method: "get",
  path: "/styles",
  summary: "Get style presets",
  tags: ["Assets"],
  description: "Returns list of available style presets for generation.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AssetStylePresetsResponseSchema,
        },
      },
      description: "Styles list",
    },
  },
});

app.openapi(getStylesRoute, (c) => {
  const imagenService = getImagenService();
  const styles = imagenService.getStylePresets();

  return c.json({ styles });
});

export { app as assetsRouter };
