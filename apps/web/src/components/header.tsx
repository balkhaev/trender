"use client";
import Link from "next/link";
import { QueueStatus } from "./queue-status";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-glass-border border-b bg-surface-1 shadow-(--shadow-glass) backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-6">
          <Link className="font-semibold text-lg tracking-tight" href="/">
            Trender
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/idea"
            >
              Идея
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/crop"
            >
              Обрезка
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/queues"
            >
              Очереди
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <QueueStatus />
        </div>
      </div>
    </header>
  );
}
