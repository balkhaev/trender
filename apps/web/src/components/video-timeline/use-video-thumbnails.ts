"use client";

import { useEffect, useState } from "react";

type UseThumbnailsReturn = {
  thumbnails: string[];
  isLoading: boolean;
  error: string | null;
};

export function useVideoThumbnails(
  videoUrl: string | null,
  count = 10,
  thumbnailWidth = 120
): UseThumbnailsReturn {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setError("Canvas not supported");
      return;
    }

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";

    const generateThumbnails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Wait for video metadata
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("Failed to load video"));
          video.src = videoUrl;
        });

        const duration = video.duration;
        if (!(duration && Number.isFinite(duration))) {
          throw new Error("Invalid video duration");
        }

        // Calculate thumbnail dimensions
        const aspectRatio = video.videoWidth / video.videoHeight;
        const thumbnailHeight = Math.round(thumbnailWidth / aspectRatio);
        canvas.width = thumbnailWidth;
        canvas.height = thumbnailHeight;

        const generatedThumbnails: string[] = [];
        const interval = duration / count;

        for (let i = 0; i < count; i++) {
          if (cancelled) break;

          const time = i * interval;

          // Seek to time
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = time;
          });

          // Draw frame to canvas
          ctx.drawImage(video, 0, 0, thumbnailWidth, thumbnailHeight);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          generatedThumbnails.push(dataUrl);
        }

        if (!cancelled) {
          setThumbnails(generatedThumbnails);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    generateThumbnails();

    return () => {
      cancelled = true;
      video.src = "";
      video.load();
    };
  }, [videoUrl, count, thumbnailWidth]);

  return { thumbnails, isLoading, error };
}
