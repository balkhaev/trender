"use client";

import { QueueManager } from "@/components/queue-manager";

export default function QueuesPage() {
  return (
    <main className="container mx-auto max-w-[1400px] px-4 py-8 lg:px-6">
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Управление очередями</h1>
        <p className="mt-1 text-muted-foreground">
          Просмотр и управление фоновыми задачами
        </p>
      </div>
      <QueueManager />
    </main>
  );
}
