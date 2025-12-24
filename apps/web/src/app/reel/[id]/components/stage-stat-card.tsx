"use client";

import { Badge } from "@/components/ui/badge";
import type { StageStats } from "@/lib/templates-api";

type StageStatCardProps = {
  stat: StageStats;
};

export function StageStatCard({ stat }: StageStatCardProps) {
  const avgDuration =
    stat.count > 0 ? Math.round(stat.totalDuration / stat.count) : 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium capitalize">{stat.stage}</h4>
        {stat.errors > 0 ? (
          <Badge variant="destructive">{stat.errors} ошибок</Badge>
        ) : (
          <Badge variant="secondary">OK</Badge>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Логов:</span>{" "}
          <span className="font-medium">{stat.count}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Общее:</span>{" "}
          <span className="font-medium">{stat.totalDuration}ms</span>
        </div>
        <div>
          <span className="text-muted-foreground">Среднее:</span>{" "}
          <span className="font-medium">{avgDuration}ms</span>
        </div>
      </div>
    </div>
  );
}
