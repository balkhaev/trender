import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="container mx-auto flex h-full max-w-2xl items-center justify-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <h1 className="text-center font-semibold text-2xl">
            Страница не найдена
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">
            Возможно, вы перешли по старой ссылке или страница была удалена.
          </p>
          <Button asChild size="lg">
            <Link href="/">На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
