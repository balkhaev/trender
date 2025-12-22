"use client";

import { ReelsPipeline } from "@/components/dashboard/reels-pipeline";
import { ScraperPanel } from "@/components/dashboard/scraper-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useReelStats } from "@/lib/hooks/use-dashboard";

export default function Dashboard() {
  const { data: stats } = useReelStats();

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4 lg:p-6">
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[22rem_1fr]">
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Всего рилов</span>
                <Badge variant="secondary">{stats?.total || 0}</Badge>
              </div>

              <Separator className="h-4" orientation="vertical" />

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Шаблонов</span>
                <Badge variant="secondary">{stats?.templates || 0}</Badge>
              </div>

              {(stats?.byStatus.downloading ?? 0) > 0 ||
              (stats?.byStatus.analyzing ?? 0) > 0 ? (
                <>
                  <Separator className="h-4" orientation="vertical" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">В обработке</span>
                    <Badge className="animate-pulse" variant="default">
                      {(stats?.byStatus.downloading || 0) +
                        (stats?.byStatus.analyzing || 0)}
                    </Badge>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScraperPanel />
          </div>
        </div>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Пайплайн</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-0">
            <ReelsPipeline />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
