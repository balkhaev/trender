"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { VideoPreview } from "@/components/video-preview";
import { hasVideo, type ReelStatus, type SavedReel } from "@/lib/reels-api";

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: ReelStatus }) {
  const variants: Record<
    ReelStatus,
    { className: string; label: string; icon: ReactNode }
  > = {
    scraped: {
      className: "bg-gray-500/10 text-gray-500",
      label: "Найден",
      icon: null,
    },
    downloading: {
      className: "bg-blue-500/10 text-blue-500",
      label: "Загрузка...",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    downloaded: {
      className: "bg-green-500/10 text-green-500",
      label: "Загружен",
      icon: <Download className="h-3 w-3" />,
    },
    analyzing: {
      className: "bg-purple-500/10 text-purple-500",
      label: "Анализ...",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    analyzed: {
      className: "bg-emerald-500/10 text-emerald-500",
      label: "Готов",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      className: "bg-red-500/10 text-red-500",
      label: "Ошибка",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };

  const variant = variants[status];

  return (
    <Badge className={`gap-1 ${variant.className}`} variant="secondary">
      {variant.icon}
      {variant.label}
    </Badge>
  );
}

type ReelPreviewProps = {
  reel: SavedReel;
};

function ReelPreview({ reel }: ReelPreviewProps) {
  return (
    <div className="relative">
      {hasVideo(reel) ? (
        <VideoPreview
          className="aspect-[9/16] w-full"
          reelId={reel.id}
          s3Key={reel.s3Key}
          source={reel.source || "reels"}
        />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center bg-muted">
          <Play className="h-12 w-12 text-muted-foreground/50" />
        </div>
      )}

      <div className="absolute top-2 left-2">
        <StatusBadge status={reel.status} />
      </div>

      {reel.likeCount ? (
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white text-xs">
          <Heart className="h-3 w-3 fill-red-500 text-red-500" />
          {formatNumber(reel.likeCount)}
        </div>
      ) : null}

      {reel.viewCount !== null || reel.commentCount !== null ? (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-full bg-black/60 px-2 py-1 text-white text-xs">
          {reel.viewCount ? (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatNumber(reel.viewCount)}
            </span>
          ) : null}
          {reel.commentCount ? (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {formatNumber(reel.commentCount)}
            </span>
          ) : null}
        </div>
      ) : null}

      {reel.duration ? (
        <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white text-xs">
          <Clock className="h-3 w-3" />
          {formatDuration(reel.duration)}
        </div>
      ) : null}
    </div>
  );
}

type ReelCardProps = {
  reel: SavedReel;
};

export function ReelCard({ reel }: ReelCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md">
      {/* Video Preview */}
      <ReelPreview reel={reel} />

      {/* Caption with link to detail */}
      <Link className="block p-2" href={`/reel/${reel.id}`}>
        <p className="line-clamp-1 text-muted-foreground text-sm transition-colors hover:text-foreground">
          {reel.caption || "Нет описания"}
        </p>
      </Link>
    </div>
  );
}
