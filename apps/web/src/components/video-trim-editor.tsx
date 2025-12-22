"use client";

import { Pause, Play, Scissors, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type VideoTrimEditorProps = {
  videoFile: File;
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
  onTrim,
  isLoading = false,
}: VideoTrimEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);

  const videoUrl = useMemo(() => URL.createObjectURL(videoFile), [videoFile]);

  // Cleanup URL on unmount
  useEffect(
    () => () => {
      URL.revokeObjectURL(videoUrl);
    },
    [videoUrl]
  );

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimRange([0, dur]);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
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

  const handleRangeChange = useCallback((values: number[]) => {
    setTrimRange([values[0], values[1]]);
  }, []);

  const handleTrim = useCallback(() => {
    onTrim(trimRange[0], trimRange[1]);
  }, [onTrim, trimRange]);

  const trimDuration = trimRange[1] - trimRange[0];

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          className="h-full w-full object-contain"
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={handleTimeUpdate}
          ref={videoRef}
          src={videoUrl}
        />
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          onClick={handleSeekToStart}
          size="icon"
          title="К началу выделения"
          variant="outline"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
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
          onClick={handleSeekToEnd}
          size="icon"
          title="К концу выделения"
          variant="outline"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Time Range Slider */}
      {duration > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-muted-foreground text-sm">
            <span>Начало: {formatTime(trimRange[0])}</span>
            <span>Текущее: {formatTime(currentTime)}</span>
            <span>Конец: {formatTime(trimRange[1])}</span>
          </div>

          <Slider
            max={duration}
            min={0}
            onValueChange={handleRangeChange}
            step={0.1}
            value={trimRange}
          />

          <div className="text-center text-muted-foreground text-sm">
            Длительность: {formatTime(trimDuration)} (из {formatTime(duration)})
          </div>
        </div>
      )}

      {/* Trim Button */}
      <Button
        className="w-full"
        disabled={isLoading || trimDuration <= 0}
        onClick={handleTrim}
      >
        <Scissors className="mr-2 h-4 w-4" />
        {isLoading ? "Обрезаем..." : "Обрезать видео"}
      </Button>
    </div>
  );
}
