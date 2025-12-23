"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTraces } from "@/lib/hooks/use-traces";
import { formatDuration, type SpanStatus } from "@/lib/traces-api";
import { TraceDetailDialog } from "./trace-detail-dialog";

export function TraceList() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SpanStatus | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const { data, isLoading, refetch, isRefetching } = useTraces({
    limit: 50,
    status: statusFilter === "all" ? undefined : statusFilter,
    service: serviceFilter === "all" ? undefined : serviceFilter,
  });

  const getStatusColor = (status: SpanStatus) => {
    switch (status) {
      case "ok":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Traces ({data?.total ?? 0})</CardTitle>
          <Button
            disabled={isRefetching}
            onClick={() => refetch()}
            size="sm"
            variant="outline"
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <Select
              onValueChange={(v) => setStatusFilter(v as SpanStatus | "all")}
              value={statusFilter}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="unset">Unset</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={setServiceFilter} value={serviceFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Сервис" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="scrapper">Scrapper</SelectItem>
                <SelectItem value="video-frames">Video Frames</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Сервис</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Spans</TableHead>
                    <TableHead>Длительность</TableHead>
                    <TableHead>Время</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.traces.length === 0 ? (
                    <TableRow>
                      <TableCell
                        className="text-center text-muted-foreground"
                        colSpan={7}
                      >
                        Нет traces
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.traces.map((trace) => (
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        key={trace.id}
                        onClick={() => setSelectedTraceId(trace.traceId)}
                      >
                        <TableCell className="font-mono text-xs">
                          {trace.traceId.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {trace.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{trace.rootService}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(trace.status)}>
                            {trace.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {trace._count?.spans ?? trace.spans?.length ?? 0}
                        </TableCell>
                        <TableCell>
                          {formatDuration(trace.durationMs)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(trace.startedAt).toLocaleString("ru-RU")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTraceId && (
        <TraceDetailDialog
          onClose={() => setSelectedTraceId(null)}
          traceId={selectedTraceId}
        />
      )}
    </>
  );
}
