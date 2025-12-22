"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type VideoPreviewProps = {
  reelId: string;
  source: string;
  s3Key?: string | null;
  poster?: string;
  className?: string;
};

type ProgressBarProps = {
  progress: number;
  onSeek: (progress: number) => void;
};

function ProgressBar({ progress, onSeek }: ProgressBarProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(1, clickPosition)));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 0.05;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, progress - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(1, progress + step));
    }
  };

  return (
    <div
      aria-label="Прогресс видео"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(progress * 100)}
      className="absolute right-0 bottom-0 left-0 h-1 cursor-pointer bg-white/30"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      ref={progressRef}
      role="slider"
      tabIndex={0}
    >
      <div
        className="h-full bg-white transition-[width] duration-100"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type PlayOverlayProps = {
  isPlaying: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
};

function PlayOverlay({ isPlaying, onClick }: PlayOverlayProps) {
  return (
    <button
      className={cn(
        "absolute inset-0 flex items-center justify-center transition-opacity",
        isPlaying
          ? "bg-transparent opacity-0 hover:bg-black/20 hover:opacity-100"
          : "bg-black/20 hover:bg-black/30"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="rounded-full bg-white/90 p-3">
        {isPlaying ? (
          <Pause className="h-6 w-6 fill-current text-black" />
        ) : (
          <Play className="h-6 w-6 fill-current text-black" />
        )}
      </div>
    </button>
  );
}

type MuteButtonProps = {
  isMuted: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
};

function MuteButton({ isMuted, onClick }: MuteButtonProps) {
  return (
    <button
      className="absolute right-2 bottom-2 rounded-full bg-black/50 p-1.5 text-white transition-opacity hover:bg-black/70"
      onClick={onClick}
      type="button"
    >
      {isMuted ? (
        <VolumeX className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </button>
  );
}

function LoadingIndicator() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

export function VideoPreview({
  reelId,
  source,
  s3Key,
  poster,
  className,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);

  // Use S3 endpoint if s3Key exists, otherwise fall back to old download endpoint
  const videoUrl = s3Key
    ? `${API_URL}/api/files/reels/${reelId}`
    : `${API_URL}/api/reels/downloads/${source}/${reelId}.mp4`;

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const { currentTime, duration } = videoRef.current;
      if (duration > 0) {
        setProgress(currentTime / duration);
      }
    }
  }, []);

  const handleSeek = useCallback((newProgress: number) => {
    if (videoRef.current) {
      const { duration } = videoRef.current;
      if (duration > 0) {
        videoRef.current.currentTime = newProgress * duration;
        setProgress(newProgress);
      }
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener("timeupdate", handleTimeUpdate);
      return () => video.removeEventListener("timeupdate", handleTimeUpdate);
    }
  }, [handleTimeUpdate]);

  const toggleMute = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePlay = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {
          // Игнорируем возможный отказ браузера воспроизводить без жеста пользователя
        });
        setIsPlaying(true);
      }
    }
  };

  const showControls = isLoaded && !hasError;
  const showLoading = !(isLoaded || hasError);

  return (
    <div
      className={cn(
        "relative aspect-9/16 overflow-hidden rounded-lg bg-muted",
        className
      )}
    >
      {hasError ? (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          Видео недоступно
        </div>
      ) : (
        <>
          <video
            className="h-full w-full object-cover"
            loop
            muted={isMuted}
            onError={() => setHasError(true)}
            onLoadedData={() => setIsLoaded(true)}
            playsInline
            poster={poster}
            preload="metadata"
            ref={videoRef}
            src={videoUrl}
          />

          {/* Play/Pause overlay */}
          {showControls ? (
            <PlayOverlay isPlaying={isPlaying} onClick={handlePlay} />
          ) : null}

          {/* Mute button */}
          {showControls ? (
            <MuteButton isMuted={isMuted} onClick={toggleMute} />
          ) : null}

          {/* Progress bar */}
          {showControls ? (
            <ProgressBar onSeek={handleSeek} progress={progress} />
          ) : null}

          {/* Loading indicator */}
          {showLoading ? <LoadingIndicator /> : null}
        </>
      )}
    </div>
  );
}
