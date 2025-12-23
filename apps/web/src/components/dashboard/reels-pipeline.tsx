"use client";

import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAllReels,
  useBatchAnalyze,
  useDeleteAllReels,
  useReelStats,
} from "@/lib/hooks/use-dashboard";
import type { ReelStatus, SavedReel } from "@/lib/reels-api";
import { ReelCard } from "./reel-card";

type SortField = "createdAt" | "likeCount" | "viewCount" | "commentCount";
type SortDirection = "asc" | "desc";

type SortConfig = {
  field: SortField;
  direction: SortDirection;
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Дата" },
  { value: "likeCount", label: "Лайки" },
  { value: "viewCount", label: "Просмотры" },
  { value: "commentCount", label: "Комменты" },
];

const STORAGE_KEY = "reels-sort-config";

function loadSortConfig(): SortConfig {
  if (typeof window === "undefined") {
    return { field: "createdAt", direction: "desc" };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SortConfig;
    }
  } catch {
    // ignore
  }
  return { field: "createdAt", direction: "desc" };
}

function saveSortConfig(config: SortConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

type TabValue = "all" | ReelStatus;

const TAB_CONFIG: {
  value: TabValue;
  label: string;
  statusKey?: keyof NonNullable<
    ReturnType<typeof useReelStats>["data"]
  >["byStatus"];
}[] = [
  { value: "all", label: "Все" },
  { value: "scraped", label: "Найдены", statusKey: "scraped" },
  { value: "downloaded", label: "Загружены", statusKey: "downloaded" },
  { value: "analyzed", label: "Готовы", statusKey: "analyzed" },
  { value: "failed", label: "Ошибки", statusKey: "failed" },
];

export function ReelsPipeline() {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [analysisType, setAnalysisType] = useState<"standard" | "frames">(
    "standard"
  );
  const [analyzeAllDownloaded, setAnalyzeAllDownloaded] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: stats } = useReelStats();
  const { data, isLoading } = useAllReels(200, debouncedSearch || undefined);
  const deleteAllMutation = useDeleteAllReels();
  const batchAnalyzeMutation = useBatchAnalyze();

  // Debounce поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Сохраняем сортировку в localStorage при изменении
  useEffect(() => {
    saveSortConfig(sortConfig);
  }, [sortConfig]);

  const handleSortFieldChange = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field ? prev.direction : "desc",
    }));
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortConfig((prev) => ({
      ...prev,
      direction: prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const reels = data?.reels || [];

  // Рилы готовые к анализу (скачанные, но не проанализированные)
  const reelsReadyForAnalysis = useMemo(
    () =>
      reels.filter(
        (r) =>
          (r.localPath || r.s3Key) &&
          r.status !== "analyzed" &&
          r.status !== "analyzing"
      ),
    [reels]
  );

  const filteredAndSortedReels = useMemo(() => {
    const filtered =
      activeTab === "all" ? reels : reels.filter((r) => r.status === activeTab);

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.field] ?? 0;
      const bVal = b[sortConfig.field] ?? 0;

      if (sortConfig.field === "createdAt") {
        const aTime = new Date(aVal as string).getTime();
        const bTime = new Date(bVal as string).getTime();
        return sortConfig.direction === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [reels, activeTab, sortConfig]);

  const getCount = (tab: TabValue): number => {
    if (tab === "all") {
      return stats?.total || 0;
    }
    if (!stats) {
      return 0;
    }
    return stats.byStatus[tab as keyof typeof stats.byStatus] || 0;
  };

  const handleDeleteAll = async () => {
    try {
      const result = await deleteAllMutation.mutateAsync();
      toast.success(`Удалено ${result.deleted} рилсов`);
      setDeleteDialogOpen(false);
    } catch {
      toast.error("Не удалось удалить рилсы");
    }
  };

  const handleBatchAnalyze = async () => {
    const reelsToAnalyze = analyzeAllDownloaded
      ? reelsReadyForAnalysis
      : reelsReadyForAnalysis.slice(0, 10);

    if (reelsToAnalyze.length === 0) {
      toast.error("Нет рилсов для анализа");
      return;
    }

    try {
      const result = await batchAnalyzeMutation.mutateAsync({
        reelIds: reelsToAnalyze.map((r) => r.id),
        analysisType,
      });

      toast.success(result.message);
      setBatchDialogOpen(false);
    } catch {
      toast.error("Не удалось запустить батч-анализ");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(v) => setActiveTab(v as TabValue)}
        value={activeTab}
      >
        <div className="flex items-center gap-2">
          <TabsList className="flex-1 justify-start">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger
                className="gap-1.5"
                key={tab.value}
                value={tab.value}
              >
                {tab.label}
                <Badge
                  className="h-5 min-w-[20px] px-1.5 text-xs"
                  variant="secondary"
                >
                  {getCount(tab.value)}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Поиск */}
          <div className="relative shrink-0">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              value={searchQuery}
            />
          </div>

          {/* Сортировка */}
          <div className="flex shrink-0 items-center gap-1">
            <Select
              onValueChange={(v) => handleSortFieldChange(v as SortField)}
              value={sortConfig.field}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="h-8 w-8 shrink-0"
              onClick={toggleSortDirection}
              size="icon"
              title={
                sortConfig.direction === "asc"
                  ? "По возрастанию"
                  : "По убыванию"
              }
              variant="outline"
            >
              {sortConfig.direction === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Батч-анализ */}
          <Dialog onOpenChange={setBatchDialogOpen} open={batchDialogOpen}>
            <Button
              className="shrink-0"
              disabled={
                reelsReadyForAnalysis.length === 0 ||
                batchAnalyzeMutation.isPending
              }
              onClick={() => setBatchDialogOpen(true)}
              size="sm"
              variant="default"
            >
              {batchAnalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Анализ</span>
              {reelsReadyForAnalysis.length > 0 && (
                <Badge className="ml-1.5 h-5" variant="secondary">
                  {reelsReadyForAnalysis.length}
                </Badge>
              )}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Батч-анализ рилсов</DialogTitle>
                <DialogDescription>
                  Запустить анализ для {reelsReadyForAnalysis.length} рилсов с
                  видео
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Тип анализа</Label>
                  <Select
                    onValueChange={(v) =>
                      setAnalysisType(v as "standard" | "frames")
                    }
                    value={analysisType}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">
                        Стандартный (полное видео)
                      </SelectItem>
                      <SelectItem value="frames">По кадрам</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={analyzeAllDownloaded}
                    id="analyzeAll"
                    onCheckedChange={(checked) =>
                      setAnalyzeAllDownloaded(checked === true)
                    }
                  />
                  <Label className="cursor-pointer" htmlFor="analyzeAll">
                    Анализировать все ({reelsReadyForAnalysis.length})
                  </Label>
                </div>

                {!analyzeAllDownloaded && (
                  <p className="text-muted-foreground text-sm">
                    Будет проанализировано первые 10 рилсов
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setBatchDialogOpen(false)}
                  variant="outline"
                >
                  Отмена
                </Button>
                <Button
                  disabled={batchAnalyzeMutation.isPending}
                  onClick={handleBatchAnalyze}
                >
                  {batchAnalyzeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Запустить анализ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog
            onOpenChange={setDeleteDialogOpen}
            open={deleteDialogOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                className="shrink-0"
                disabled={reels.length === 0 || deleteAllMutation.isPending}
                size="sm"
                variant="outline"
              >
                {deleteAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-1.5 hidden sm:inline">Очистить</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить все рилсы?</AlertDialogTitle>
                <AlertDialogDescription>
                  Это действие удалит все {stats?.total || 0} рилсов, включая
                  связанные файлы и анализы. Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteAll}
                >
                  {deleteAllMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Удалить все
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col"
          value={activeTab}
        >
          <ReelsContent
            filteredReels={filteredAndSortedReels}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReelsContent({
  filteredReels,
  isLoading,
}: {
  filteredReels: SavedReel[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filteredReels.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Нет рилсов
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filteredReels.map((reel) => (
          <ReelCard key={reel.id} reel={reel} />
        ))}
      </div>
    </div>
  );
}
