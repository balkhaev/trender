"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrace } from "@/lib/hooks/use-traces";
import {
  formatDuration,
  type SpanKind,
  type SpanStatus,
  type TraceSpan,
} from "@/lib/traces-api";

type Props = {
  traceId: string;
  onClose: () => void;
};

export function TraceDetailDialog({ traceId, onClose }: Props) {
  const { data: trace, isLoading } = useTrace(traceId);

  const getStatusColor = (status: SpanStatus) => {
    switch (status) {
      case "ok":
        return "bg-green-500/10 text-green-500";
      case "error":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const getKindColor = (kind: SpanKind) => {
    const colors: Record<SpanKind, string> = {
      server: "bg-blue-500",
      client: "bg-purple-500",
      producer: "bg-yellow-500",
      consumer: "bg-green-500",
      internal: "bg-gray-400",
    };
    return colors[kind] || "bg-gray-400";
  };

  if (isLoading || !trace) {
    return (
      <Dialog onOpenChange={() => onClose()} open>
        <DialogContent className="max-w-4xl">
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const traceStartTime = new Date(trace.startedAt).getTime();
  const traceDuration = trace.durationMs || 1;

  return (
    <Dialog onOpenChange={() => onClose()} open>
      <DialogContent className="max-h-[85vh] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{traceId.slice(0, 8)}...</span>
            <Badge className={getStatusColor(trace.status)}>
              {trace.status}
            </Badge>
            <span className="text-muted-foreground">
              {formatDuration(trace.durationMs)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Название:</span>
              <span className="ml-2">{trace.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Сервис:</span>
              <span className="ml-2">{trace.rootService}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Path:</span>
              <span className="ml-2 font-mono">{trace.rootPath || "-"}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-blue-500" />
              <span>server</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-purple-500" />
              <span>client</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-yellow-500" />
              <span>producer</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-green-500" />
              <span>consumer</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-gray-400" />
              <span>internal</span>
            </div>
          </div>

          {/* Waterfall timeline */}
          <ScrollArea className="h-[400px] rounded-lg border p-4">
            <div className="space-y-1">
              {renderSpanTree(
                trace.spans || [],
                null,
                0,
                traceStartTime,
                traceDuration,
                getKindColor
              )}
            </div>
          </ScrollArea>

          {/* Error message */}
          {trace.errorMessage && (
            <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
              {trace.errorMessage}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderSpanTree(
  allSpans: TraceSpan[],
  parentId: string | null,
  depth: number,
  traceStartTime: number,
  traceDuration: number,
  getKindColor: (kind: SpanKind) => string
): React.ReactNode {
  const children = allSpans.filter((s) => s.parentSpanId === parentId);

  return children.map((span) => {
    const spanStart = new Date(span.startedAt).getTime();
    const offset = ((spanStart - traceStartTime) / traceDuration) * 100;
    const width = span.durationMs ? (span.durationMs / traceDuration) * 100 : 1;

    const kindColor = getKindColor(span.kind);

    return (
      <div key={span.id} style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2 py-1">
          {/* Service badge */}
          <Badge className="w-24 justify-center text-xs" variant="outline">
            {span.service}
          </Badge>

          {/* Span name */}
          <span className="w-48 truncate text-sm" title={span.name}>
            {span.name}
          </span>

          {/* Timeline bar */}
          <div className="relative h-6 flex-1 rounded bg-muted">
            <div
              className={`absolute h-full rounded opacity-80 ${kindColor}`}
              style={{
                left: `${Math.max(0, Math.min(100, offset))}%`,
                width: `${Math.max(0.5, Math.min(100 - offset, width))}%`,
              }}
            />
          </div>

          {/* Duration */}
          <span className="w-16 text-right text-muted-foreground text-xs">
            {formatDuration(span.durationMs)}
          </span>

          {/* Status */}
          {span.status === "error" && (
            <Badge className="text-xs" variant="destructive">
              error
            </Badge>
          )}
        </div>

        {/* Render children recursively */}
        {renderSpanTree(
          allSpans,
          span.spanId,
          depth + 1,
          traceStartTime,
          traceDuration,
          getKindColor
        )}
      </div>
    );
  });
}
