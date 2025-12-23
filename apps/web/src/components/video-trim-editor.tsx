"use client";

import {
  Eye,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoTimeline } from "./video-timeline";
import { TimeInput } from "./video-timeline/time-input";

type VideoTrimEditorProps = {
  videoFile?: File;
  videoUrl?: string;
  onTrim: (startTime: number, endTime: number) => void;
  isLoading?: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

export function VideoTrimEditor({
  videoFile,
  videoUrl: externalUrl,
  onTrim,
  isLoading = false,
}: VideoTrimEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const blobUrl = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : null),
    [videoFile]
  );

  const videoUrl = externalUrl || blobUrl || "";

  // Cleanup URL on unmount (only for blob URLs)
  useEffect(
    () => () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    },
    [blobUrl]
  );

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimRange([0, dur]);
      setVideoError(null);
    }
  }, []);

  const handleVideoError = useCallback(() => {
    setVideoError("Не удалось загрузить видео. Файл недоступен или повреждён.");
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // Stop at end of selection in preview mode
      if (isPreviewMode && time >= trimRange[1]) {
        videoRef.current.pause();
        videoRef.current.currentTime = trimRange[1];
        setIsPreviewMode(false);
      }
    }
  }, [isPreviewMode, trimRange]);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPreviewMode(false);
      } else {
        videoRef.current.play().catch(() => {
          setVideoError("Не удалось воспроизвести видео");
        });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeekToStart = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[0];
      setCurrentTime(trimRange[0]);
    }
  }, [trimRange]);

  const handleSeekToEnd = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[1];
      setCurrentTime(trimRange[1]);
    }
  }, [trimRange]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleRangeChange = useCallback((range: [number, number]) => {
    setTrimRange(range);
    setIsPreviewMode(false);
  }, []);

  const handleStartTimeChange = useCallback(
    (time: number) => {
      const newStart = Math.min(time, trimRange[1] - 0.1);
      setTrimRange([Math.max(0, newStart), trimRange[1]]);
      setIsPreviewMode(false);
    },
    [trimRange]
  );

  const handleEndTimeChange = useCallback(
    (time: number) => {
      const newEnd = Math.max(time, trimRange[0] + 0.1);
      setTrimRange([trimRange[0], Math.min(duration, newEnd)]);
      setIsPreviewMode(false);
    },
    [trimRange, duration]
  );

  const handlePreview = useCallback(() => {
    if (!videoRef.current) return;

    if (isPreviewMode) {
      videoRef.current.pause();
      setIsPreviewMode(false);
    } else {
      videoRef.current.currentTime = trimRange[0];
      setCurrentTime(trimRange[0]);
      videoRef.current.play().catch(() => {
        setVideoError("Не удалось воспроизвести видео");
      });
      setIsPreviewMode(true);
      setIsPlaying(true);
    }
  }, [isPreviewMode, trimRange]);

  const handleTrim = useCallback(() => {
    onTrim(trimRange[0], trimRange[1]);
  }, [onTrim, trimRange]);

  const trimDuration = trimRange[1] - trimRange[0];

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {videoError ? (
          <div className="flex h-full items-center justify-center text-center text-red-400">
            <p>{videoError}</p>
          </div>
        ) : (
          <video
            className="h-full w-full object-contain"
            onEnded={() => {
              setIsPlaying(false);
              setIsPreviewMode(false);
            }}
            onError={handleVideoError}
            onLoadedMetadata={handleLoadedMetadata}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={handleTimeUpdate}
            ref={videoRef}
            src={videoUrl}
          />
        )}
      </div>

      {/* Timeline with thumbnails */}
      {duration > 0 && (
        <VideoTimeline
          currentTime={currentTime}
          duration={duration}
          onRangeChange={handleRangeChange}
          onSeek={handleSeek}
          trimRange={trimRange}
          videoUrl={videoUrl}
        />
      )}

      {/* Playback Controls + Time Inputs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            disabled={!!videoError}
            onClick={handleSeekToStart}
            size="icon"
            title="К началу выделения"
            variant="outline"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            disabled={!!videoError}
            onClick={handlePlayPause}
            size="icon"
            title={isPlaying ? "Пауза" : "Воспроизвести"}
            variant="outline"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            disabled={!!videoError}
            onClick={handleSeekToEnd}
            size="icon"
            title="К концу выделения"
            variant="outline"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {duration > 0 && (
          <div className="flex gap-4">
            <TimeInput
              label="Начало"
              max={trimRange[1] - 0.1}
              min={0}
              onChange={handleStartTimeChange}
              value={trimRange[0]}
            />
            <TimeInput
              label="Конец"
              max={duration}
              min={trimRange[0] + 0.1}
              onChange={handleEndTimeChange}
              value={trimRange[1]}
            />
          </div>
        )}
      </div>

      {/* Duration info */}
      {duration > 0 && (
        <div className="text-center text-muted-foreground text-sm">
          Выбрано: {formatTime(trimDuration)} из {formatTime(duration)}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!!videoError || trimDuration <= 0}
          onClick={handlePreview}
          variant="outline"
        >
          <Eye className="mr-2 h-4 w-4" />
          {isPreviewMode ? "Остановить" : "Предпросмотр"}
        </Button>
        <Button
          className="flex-1"
          disabled={isLoading || trimDuration <= 0 || !!videoError}
          onClick={handleTrim}
        >
          <Scissors className="mr-2 h-4 w-4" />
          {isLoading ? "Обрезаем..." : "Обрезать"}
        </Button>
      </div>
    </div>
  );
}
