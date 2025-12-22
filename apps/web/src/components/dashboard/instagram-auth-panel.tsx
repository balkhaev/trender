"use client";

import {
  AlertCircle,
  CheckCircle2,
  Cookie,
  Loader2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStatus, useUploadCookies } from "@/lib/hooks/use-dashboard";

type InstagramCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

function validateCookies(cookies: unknown): cookies is InstagramCookie[] {
  if (!Array.isArray(cookies)) {
    return false;
  }

  return cookies.every(
    (cookie) =>
      typeof cookie === "object" &&
      cookie !== null &&
      typeof cookie.name === "string" &&
      typeof cookie.value === "string" &&
      typeof cookie.domain === "string"
  );
}

export function InstagramAuthPanel() {
  const { data: authStatus, isLoading } = useAuthStatus();
  const uploadCookies = useUploadCookies();
  const [cookiesText, setCookiesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    setError(null);

    try {
      const parsed = JSON.parse(cookiesText) as unknown;

      if (!validateCookies(parsed)) {
        setError(
          "Неверный формат cookies. Каждый cookie должен содержать name, value и domain."
        );
        return;
      }

      uploadCookies.mutate(parsed, {
        onSuccess: () => {
          setCookiesText("");
          setIsOpen(false);
        },
        onError: (err) => {
          setError(err.message);
        },
      });
    } catch {
      setError("Невалидный JSON. Проверьте формат данных.");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCookiesText(content);
    };
    reader.readAsText(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Проверка авторизации...
      </div>
    );
  }

  const isConfigured = authStatus?.isConfigured ?? false;

  return (
    <div className="space-y-3">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Instagram</span>
        {isConfigured ? (
          <Badge className="border-green-500 text-green-600" variant="outline">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Авторизован
          </Badge>
        ) : (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Не авторизован
          </Badge>
        )}
      </div>

      {/* Warning if not configured */}
      {!isConfigured && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Требуется авторизация</AlertTitle>
          <AlertDescription>
            Загрузите cookies из браузера для доступа к Instagram.
          </AlertDescription>
        </Alert>
      )}

      {/* Collapsible Cookie Upload Section */}
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger asChild>
          <Button className="w-full" size="sm" variant="outline">
            <Cookie className="mr-2 h-4 w-4" />
            {isConfigured ? "Обновить cookies" : "Загрузить cookies"}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              Экспортируйте cookies из браузера с помощью расширения{" "}
              <a
                className="text-primary underline"
                href="https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg"
                rel="noopener noreferrer"
                target="_blank"
              >
                EditThisCookie
              </a>{" "}
              или{" "}
              <a
                className="text-primary underline"
                href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                rel="noopener noreferrer"
                target="_blank"
              >
                Cookie-Editor
              </a>
              .
            </p>

            <div className="flex gap-2">
              <input
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
                ref={fileInputRef}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                variant="secondary"
              >
                <Upload className="mr-2 h-3 w-3" />
                Загрузить файл
              </Button>
            </div>

            <Textarea
              className="min-h-[100px] font-mono text-xs"
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder='[{"name": "sessionid", "value": "...", "domain": ".instagram.com"}, ...]'
              value={cookiesText}
            />

            {error ? <p className="text-destructive text-xs">{error}</p> : null}

            <Button
              className="w-full"
              disabled={!cookiesText.trim() || uploadCookies.isPending}
              onClick={handleUpload}
              size="sm"
            >
              {uploadCookies.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Сохранить cookies
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
