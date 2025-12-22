import { Hono } from "hono";

const VIDEO_FRAMES_URL =
  process.env.VIDEO_FRAMES_URL || "http://localhost:8002";

const trimRouter = new Hono();

/**
 * Trim video between start_time and end_time
 * POST /api/trim
 *
 * Accepts multipart/form-data with:
 * - video: video file
 * - startTime: start time in seconds
 * - endTime: end time in seconds
 *
 * Returns trimmed video as streaming response
 */
trimRouter.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const video = formData.get("video");
    const startTime = formData.get("startTime");
    const endTime = formData.get("endTime");

    if (!(video && video instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    if (!(startTime && endTime)) {
      return c.json({ error: "startTime and endTime are required" }, 400);
    }

    const start = Number.parseFloat(startTime.toString());
    const end = Number.parseFloat(endTime.toString());

    if (isNaN(start) || isNaN(end)) {
      return c.json(
        { error: "startTime and endTime must be valid numbers" },
        400
      );
    }

    if (start < 0) {
      return c.json({ error: "startTime must be non-negative" }, 400);
    }

    if (end <= start) {
      return c.json({ error: "endTime must be greater than startTime" }, 400);
    }

    // Create form data for video-frames service
    const proxyFormData = new FormData();
    proxyFormData.append("video", video);
    proxyFormData.append("start_time", start.toString());
    proxyFormData.append("end_time", end.toString());

    // Call video-frames service
    const response = await fetch(`${VIDEO_FRAMES_URL}/trim`, {
      method: "POST",
      body: proxyFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Trim] Video-frames service error:", errorText);
      return c.json(
        { error: "Failed to trim video", details: errorText },
        response.status as 400 | 500
      );
    }

    // Get duration from response header
    const duration = response.headers.get("X-Video-Duration");

    // Stream the response back to client
    const blob = await response.blob();

    return new Response(blob, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": blob.size.toString(),
        "Content-Disposition": "attachment; filename=trimmed_video.mp4",
        ...(duration && { "X-Video-Duration": duration }),
      },
    });
  } catch (error) {
    console.error("[Trim] Error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export { trimRouter };
