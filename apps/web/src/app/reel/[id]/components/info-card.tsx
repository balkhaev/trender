"use client";

import { Card, CardContent } from "@/components/ui/card";

type InfoCardProps = {
  label: string;
  value: string;
  icon?: React.ReactNode;
  iconBg?: string;
};

export function InfoCard({
  label,
  value,
  icon,
  iconBg = "from-primary/20 to-primary/5",
}: InfoCardProps) {
  return (
    <Card className="group transition-all duration-200 hover:border-primary/20 hover:bg-surface-2/80">
      <CardContent className="flex items-center gap-3 p-4">
        {icon && (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} transition-transform duration-200 group-hover:scale-110`}
          >
            {icon}
          </div>
        )}
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="font-semibold text-lg tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
