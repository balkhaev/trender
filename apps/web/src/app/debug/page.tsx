"use client";

import { useState } from "react";
import { DebugAIMetrics } from "@/components/debug/debug-ai-metrics";
import { DebugLogsTable } from "@/components/debug/debug-logs-table";
import { DebugOverview } from "@/components/debug/debug-overview";
import { HealthAlerts } from "@/components/debug/health-alerts";
import { TraceList } from "@/components/debug/trace-list";
import { QueueManager } from "@/components/queue-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DebugPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <main className="container mx-auto max-w-[1400px] px-4 py-8 lg:px-6">
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Debug Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Мониторинг логов, AI сервисов и очередей
        </p>
      </div>

      <div className="mb-6">
        <HealthAlerts />
      </div>

      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="logs">Логи</TabsTrigger>
          <TabsTrigger value="ai">AI сервисы</TabsTrigger>
          <TabsTrigger value="queues">Очереди</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DebugOverview />
        </TabsContent>

        <TabsContent value="traces">
          <TraceList />
        </TabsContent>

        <TabsContent value="logs">
          <DebugLogsTable />
        </TabsContent>

        <TabsContent value="ai">
          <DebugAIMetrics />
        </TabsContent>

        <TabsContent value="queues">
          <QueueManager />
        </TabsContent>
      </Tabs>
    </main>
  );
}
