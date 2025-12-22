"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAllReels,
  useDeleteAllReels,
  useReelStats,
} from "@/lib/hooks/use-dashboard";
import type { ReelStatus, SavedReel } from "@/lib/reels-api";
import { ReelCard } from "./reel-card";

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
  const { data: stats } = useReelStats();
  const { data, isLoading } = useAllReels(200);
  const deleteAllMutation = useDeleteAllReels();

  const reels = data?.reels || [];

  const filteredReels =
    activeTab === "all" ? reels : reels.filter((r) => r.status === activeTab);

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
          <ReelsContent filteredReels={filteredReels} isLoading={isLoading} />
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
