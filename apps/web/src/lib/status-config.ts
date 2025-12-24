/**
 * Конфигурация статусов для рилов и других сущностей
 */

import type { ReelStatus } from "@trender/types/reel";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";

export type StatusConfigItem = {
  label: string;
  className: string;
  icon: React.ElementType;
};

/**
 * Конфигурация статусов для страницы деталей рила (с бордерами)
 */
export const REEL_STATUS_CONFIG: Record<ReelStatus, StatusConfigItem> = {
  scraped: {
    label: "Найден",
    className: "border-glass-border bg-surface-2 text-muted-foreground",
    icon: Clock,
  },
  downloading: {
    label: "Загрузка...",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    icon: Loader2,
  },
  downloaded: {
    label: "Загружен",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  },
  analyzing: {
    label: "Анализ...",
    className: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    icon: Loader2,
  },
  analyzed: {
    label: "Готов",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    icon: Sparkles,
  },
  failed: {
    label: "Ошибка",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
    icon: XCircle,
  },
};

/**
 * Упрощенная конфигурация статусов для карточек (без бордеров)
 */
export const REEL_STATUS_CONFIG_SIMPLE: Record<ReelStatus, StatusConfigItem> = {
  scraped: {
    label: "Найден",
    className: "bg-gray-500/10 text-gray-500",
    icon: Clock,
  },
  downloading: {
    label: "Загрузка...",
    className: "bg-blue-500/10 text-blue-500",
    icon: Loader2,
  },
  downloaded: {
    label: "Загружен",
    className: "bg-green-500/10 text-green-500",
    icon: Download,
  },
  analyzing: {
    label: "Анализ...",
    className: "bg-purple-500/10 text-purple-500",
    icon: Loader2,
  },
  analyzed: {
    label: "Готов",
    className: "bg-emerald-500/10 text-emerald-500",
    icon: CheckCircle2,
  },
  failed: {
    label: "Ошибка",
    className: "bg-red-500/10 text-red-500",
    icon: AlertCircle,
  },
};

/**
 * Конфигурация уровней логов
 */
export const LOG_LEVEL_CONFIG: Record<
  string,
  { color: string; bgColor: string; borderColor: string }
> = {
  debug: {
    color: "text-muted-foreground",
    bgColor: "bg-surface-1",
    borderColor: "before:bg-muted-foreground/50",
  },
  info: {
    color: "text-blue-300",
    bgColor: "bg-blue-500/10",
    borderColor: "before:bg-blue-500",
  },
  warn: {
    color: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "before:bg-amber-500",
  },
  error: {
    color: "text-red-300",
    bgColor: "bg-red-500/10",
    borderColor: "before:bg-red-500",
  },
};

/**
 * Проверяет, является ли статус анимированным (требует Loader2)
 */
export function isAnimatedStatus(status: ReelStatus): boolean {
  return status === "downloading" || status === "analyzing";
}
