"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { AssetGenerator } from "@/components/assets/asset-generator";
import { Button } from "@/components/ui/button";

export default function AssetsPage() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl">Генерация ассетов</h1>
          <p className="text-muted-foreground">
            Создавайте фоны, персонажей, объекты и текстуры с помощью AI
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/library">
            <ImageIcon className="mr-2 h-4 w-4" />
            Библиотека
          </Link>
        </Button>
      </div>

      <AssetGenerator />
    </div>
  );
}
