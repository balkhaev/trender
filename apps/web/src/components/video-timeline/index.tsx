"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useVideoThumbnails } from "./use-video-thumbnails";

type VideoTimelineProps = {
  videoUrl: string;
  duration: number;
  currentTime: number;
  trimRange: [number, number];
  onRangeChange: (range: [number, number]) => void;
  onSeek: (time: number) => void;
  className?: string;
};

type DragType = "start" | "end" | null;

export function VideoTimeline({
  videoUrl,
  duration,
  currentTime,
  trimRange,
  onRangeChange,
  onSeek,
  className,
}: VideoTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragType, setDragType] = useState<DragType>(null);
  const { thumbnails, isLoading } = useVideoThumbnails(videoUrl, 12);

  const startPercent = duration > 0 ? (trimRange[0] / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trimRange[1] / duration) * 100 : 100;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromPosition = useCallback(
    (clientX: number) => {
      if (!containerRef.current || duration <= 0) return 0;

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * duration;
    },
    [duration]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent, type: DragType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragType(type);
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragType) return;

      const time = getTimeFromPosition(e.clientX);
      onSeek(time);
    },
    [dragType, getTimeFromPosition, onSeek]
  );

  useEffect(() => {
    if (!dragType) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromPosition(e.clientX);

      if (dragType === "start") {
        const newStart = Math.min(time, trimRange[1] - 0.1);
        onRangeChange([Math.max(0, newStart), trimRange[1]]);
      } else if (dragType === "end") {
        const newEnd = Math.max(time, trimRange[0] + 0.1);
        onRangeChange([trimRange[0], Math.min(duration, newEnd)]);
      }
    };

    const handleMouseUp = () => {
      setDragType(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragType, getTimeFromPosition, trimRange, duration, onRangeChange]);

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, type: DragType) => {
      e.stopPropagation();
      setDragType(type);
    },
    []
  );

  useEffect(() => {
    if (!dragType) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const time = getTimeFromPosition(touch.clientX);

      if (dragType === "start") {
        const newStart = Math.min(time, trimRange[1] - 0.1);
        onRangeChange([Math.max(0, newStart), trimRange[1]]);
      } else if (dragType === "end") {
        const newEnd = Math.max(time, trimRange[0] + 0.1);
        onRangeChange([trimRange[0], Math.min(duration, newEnd)]);
      }
    };

    const handleTouchEnd = () => {
      setDragType(null);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragType, getTimeFromPosition, trimRange, duration, onRangeChange]);

  return (
    <div
      className={cn(
        "relative h-16 w-full cursor-pointer select-none overflow-hidden rounded-lg bg-muted",
        className
      )}
      onClick={handleContainerClick}
      ref={containerRef}
    >
      {/* Thumbnails background */}
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : thumbnails.length > 0 ? (
        <div className="flex h-full">
          {thumbnails.map((thumb, i) => (
            <img
              alt=""
              className="h-full flex-1 object-cover"
              draggable={false}
              key={i}
              src={thumb}
            />
          ))}
        </div>
      ) : (
        <div className="h-full w-full bg-muted" />
      )}

      {/* Dimmed areas outside selection */}
      <div
        className="pointer-events-none absolute top-0 left-0 h-full bg-black/60"
        style={{ width: `${startPercent}%` }}
      />
      <div
        className="pointer-events-none absolute top-0 right-0 h-full bg-black/60"
        style={{ width: `${100 - endPercent}%` }}
      />

      {/* Selection border */}
      <div
        className="pointer-events-none absolute top-0 h-full border-primary border-y-2"
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
        }}
      />

      {/* Start handle */}
      <div
        className={cn(
          "absolute top-0 h-full w-3 cursor-ew-resize bg-primary transition-colors hover:bg-primary/80",
          dragType === "start" && "bg-primary/80"
        )}
        onMouseDown={(e) => handleMouseDown(e, "start")}
        onTouchStart={(e) => handleTouchStart(e, "start")}
        style={{ left: `calc(${startPercent}% - 6px)` }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-6 w-0.5 rounded-full bg-white" />
      </div>

      {/* End handle */}
      <div
        className={cn(
          "absolute top-0 h-full w-3 cursor-ew-resize bg-primary transition-colors hover:bg-primary/80",
          dragType === "end" && "bg-primary/80"
        )}
        onMouseDown={(e) => handleMouseDown(e, "end")}
        onTouchStart={(e) => handleTouchStart(e, "end")}
        style={{ left: `calc(${endPercent}% - 6px)` }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-6 w-0.5 rounded-full bg-white" />
      </div>

      {/* Current time indicator */}
      <div
        className="pointer-events-none absolute top-0 h-full w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]"
        style={{ left: `${currentPercent}%` }}
      />
    </div>
  );
}
