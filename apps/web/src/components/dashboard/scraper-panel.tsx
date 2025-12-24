"use client";

import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Heart,
  Link2,
  Loader2,
  Maximize,
  Play,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useAddReel,
  useAuthStatus,
  useBatchRefreshDuration,
  useBatchResizeAll,
  useProcessReel,
  useScrapeJobs,
  useStartScrape,
  useUploadPipelineVideo,
} from "@/lib/hooks/use-dashboard";
import type { JobStatus, SavedReel } from "@/lib/reels-api";
import { InstagramAuthPanel } from "./instagram-auth-panel";

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Ожидание
        </Badge>
      );
    case "running":
      return (
        <Badge variant="default">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />В процессе
        </Badge>
      );
    case "completed":
      return (
        <Badge className="border-green-500 text-green-500" variant="outline">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Готово
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Ошибка
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          {status}
        </Badge>
      );
  }
}

export function ScraperPanel() {
  const [minLikes, setMinLikes] = useState(50_000);
  const [limit, setLimit] = useState(2);
  const [reelUrl, setReelUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: authStatus } = useAuthStatus();
  const { data: jobs = [] } = useScrapeJobs();
  const startScrape = useStartScrape();
  const addReel = useAddReel();
  const uploadVideo = useUploadPipelineVideo();
  const processReel = useProcessReel();
  const batchRefreshDuration = useBatchRefreshDuration();
  const batchResizeAll = useBatchResizeAll();

  const isAuthenticated = authStatus?.isConfigured ?? false;

  const handleStartScrape = () => {
    startScrape.mutate({
      minLikes,
      limit,
      sort: "top",
    });
  };

  const handleAddReel = () => {
    if (!reelUrl.trim()) {
      return;
    }
    addReel.mutate(
      { url: reelUrl.trim() },
      {
        onSuccess: () => {
          setReelUrl("");
        },
      }
    );
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadVideo.mutate(file, {
        onSuccess: () => {
          toast.success("Видео загружено и добавлено в пайплайн");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        },
        onError: (err) => {
          toast.error(`Ошибка загрузки: ${err.message}`);
        },
      });
    }
  };

  const handleSelectFromLibrary = (reel: SavedReel) => {
    processReel.mutate(reel.id, {
      onSuccess: () => {
        toast.success("Видео отправлено в обработку");
      },
      onError: (err) => {
        toast.error(`Ошибка: ${err.message}`);
      },
    });
  };

  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "pending"
  );
  const recentJobs = jobs
    .filter((j) => j.status === "completed" || j.status === "failed")
    .slice(0, 5);

  const hasActiveScrape = activeJobs.length > 0;
  const scrapeButtonDisabled =
    startScrape.isPending || !isAuthenticated || hasActiveScrape;

  function getScrapeButtonTitle(): string | undefined {
    if (hasActiveScrape) {
      return "Дождитесь завершения текущего скрапинга";
    }
    if (!isAuthenticated) {
      return "Сначала авторизуйтесь в Instagram";
    }
    return;
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-4">
          {/* Instagram Auth */}
          <InstagramAuthPanel />

          <Separator />

          {/* Form */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="minLikes">Мин. лайков</Label>
                <Input
                  id="minLikes"
                  onChange={(e) => setMinLikes(Number(e.target.value))}
                  type="number"
                  value={minLikes}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="limit">Лимит</Label>
                <Input
                  id="limit"
                  onChange={(e) => setLimit(Number(e.target.value))}
                  type="number"
                  value={limit}
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={scrapeButtonDisabled}
              onClick={handleStartScrape}
              title={getScrapeButtonTitle()}
            >
              {startScrape.isPending || hasActiveScrape ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {hasActiveScrape ? "Скрапинг запущен..." : "Начать скрапинг"}
            </Button>
          </div>

          <Separator />

          {/* Add by URL */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Добавить по ссылке</h4>
            <div className="space-y-2">
              <Input
                onChange={(e) => setReelUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddReel();
                  }
                }}
                placeholder="https://instagram.com/reel/..."
                value={reelUrl}
              />
              <Button
                className="w-full"
                disabled={addReel.isPending || !reelUrl.trim()}
                onClick={handleAddReel}
                variant="secondary"
              >
                {addReel.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Добавить рилс
              </Button>
              {addReel.isSuccess ? (
                <p className="text-center text-muted-foreground text-xs">
                  {addReel.data.isNew
                    ? "Рилс добавлен!"
                    : "Рилс уже существует"}
                </p>
              ) : null}
              {addReel.isError ? (
                <p className="text-center text-destructive text-xs">
                  {addReel.error.message}
                </p>
              ) : null}
            </div>
          </div>

          <Separator />

          {/* Upload Video */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Загрузить свое видео</h4>
            <div className="space-y-2">
              <input
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <Button
                className="w-full"
                disabled={uploadVideo.isPending}
                onClick={handleUploadClick}
                variant="outline"
              >
                {uploadVideo.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Выбрать и загрузить видео
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                Поддерживаются MP4, MOV. Макс. 100MB.
              </p>
            </div>
          </div>

          <Separator />

          {/* Batch Refresh Duration */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Служебные функции</h4>
            <Button
              className="w-full"
              disabled={batchRefreshDuration.isPending}
              onClick={() => {
                batchRefreshDuration.mutate(undefined, {
                  onSuccess: (data) => {
                    toast.success(
                      `Обновлено ${data.updated} из ${data.total} рилов`
                    );
                  },
                  onError: (err) => {
                    toast.error(`Ошибка: ${err.message}`);
                  },
                });
              }}
              variant="outline"
            >
              {batchRefreshDuration.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Clock className="mr-2 h-4 w-4" />
              )}
              Обновить duration
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Запросить длительность для рилов без duration
            </p>

            <Button
              className="w-full"
              disabled={batchResizeAll.isPending}
              onClick={() => {
                batchResizeAll.mutate(undefined, {
                  onSuccess: (data) => {
                    if (data.processed === 0) {
                      toast.info("Нет видео для ресайза");
                    } else {
                      toast.success(
                        `Обработано: ${data.processed}, увеличено: ${data.resized}, уже OK: ${data.alreadyValid}`
                      );
                    }
                  },
                  onError: (err) => {
                    toast.error(`Ошибка: ${err.message}`);
                  },
                });
              }}
              variant="outline"
            >
              {batchResizeAll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Maximize className="mr-2 h-4 w-4" />
              )}
              Увеличить для Kling
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Апскейл видео &lt;720px для Kling API
            </p>
          </div>

          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground text-sm">
                Активные задачи
              </h4>
              {activeJobs.map((job) => (
                <div className="rounded-md border p-3 text-sm" key={job.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">
                      /reels/ • {formatNumber(job.minLikes)}+ лайков
                    </span>
                    <JobStatusBadge status={job.status} />
                  </div>

                  {/* Progress stats */}
                  <div className="mb-2 grid grid-cols-3 gap-2 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1">
                      <Search className="h-3 w-3" />
                      <span>{job.progress.scanned} просм.</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span>
                        {job.progress.found}/{job.progress.total} найд.
                      </span>
                    </div>
                    {job.progress.downloaded > 0 ? (
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        <span>{job.progress.downloaded} скач.</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Current reel being scanned */}
                  {job.progress.currentReelId ? (
                    <div className="mb-1 rounded bg-muted/50 px-2 py-1 text-xs">
                      <span className="text-muted-foreground">Текущий: </span>
                      <span className="font-mono">
                        {job.progress.currentReelId}
                      </span>
                      {job.progress.currentLikes !== undefined ? (
                        <span className="ml-1 text-muted-foreground">
                          <Heart className="mx-0.5 inline h-3 w-3" />
                          {formatNumber(job.progress.currentLikes)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Last found reel */}
                  {job.progress.lastFoundReel ? (
                    <div className="rounded bg-green-500/10 px-2 py-1 text-green-600 text-xs dark:text-green-400">
                      <CheckCircle2 className="mr-1 inline h-3 w-3" />
                      <span>Найден: </span>
                      <span className="font-mono">
                        {job.progress.lastFoundReel.id}
                      </span>
                      <span className="ml-1">
                        <Heart className="mx-0.5 inline h-3 w-3" />
                        {formatNumber(job.progress.lastFoundReel.likes)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Recent Jobs */}
          {recentJobs.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground text-sm">
                Недавние
              </h4>
              {recentJobs.map((job) => (
                <div
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                  key={job.id}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">/reels/</span>
                    <span className="text-muted-foreground text-xs">
                      {formatNumber(job.minLikes)}+ лайков •{" "}
                      {job.progress.found} найдено
                    </span>
                  </div>
                  <JobStatusBadge status={job.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
