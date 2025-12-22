"use client";

import { Download, Upload, Video, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoTrimEditor } from "@/components/video-trim-editor";
import { useTrimVideo } from "@/lib/hooks/use-trim";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/avi",
  "video/webm",
  "video/quicktime",
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CropPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [trimmedVideo, setTrimmedVideo] = useState<Blob | null>(null);

  const { mutate: trimVideo, isPending } = useTrimVideo();

  const handleFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Неподдерживаемый формат видео");
      return;
    }
    setSelectedFile(file);
    setTrimmedVideo(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setTrimmedVideo(null);
  }, []);

  const handleTrim = useCallback(
    (startTime: number, endTime: number) => {
      if (!selectedFile) return;

      trimVideo(
        { video: selectedFile, startTime, endTime },
        {
          onSuccess: (blob) => {
            setTrimmedVideo(blob);
            toast.success("Видео обрезано!");
          },
          onError: (error) => {
            toast.error(`Ошибка: ${error.message}`);
          },
        }
      );
    },
    [selectedFile, trimVideo]
  );

  const handleDownload = useCallback(() => {
    if (!(trimmedVideo && selectedFile)) return;

    const originalName = selectedFile.name.replace(/\.[^/.]+$/, "");
    downloadBlob(trimmedVideo, `${originalName}_trimmed.mp4`);
    toast.success("Видео скачано!");
  }, [trimmedVideo, selectedFile]);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl">Обрезка видео</h1>
          {selectedFile && (
            <Button onClick={clearSelection} variant="outline">
              <X className="mr-2 h-4 w-4" />
              Выбрать другое
            </Button>
          )}
        </div>

        {selectedFile ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Video className="h-5 w-5" />
                  {selectedFile.name}
                  <span className="ml-auto font-normal text-muted-foreground text-sm">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VideoTrimEditor
                  isLoading={isPending}
                  onTrim={handleTrim}
                  videoFile={selectedFile}
                />
              </CardContent>
            </Card>

            {trimmedVideo && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Результат</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-muted-foreground text-sm">
                    Размер: {(trimmedVideo.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <Button className="w-full" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Скачать обрезанное видео
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="p-0">
              <input
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                id="video-input"
                onChange={handleFileInput}
                type="file"
              />
              <button
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-transparent p-12 transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onClick={() => document.getElementById("video-input")?.click()}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                type="button"
              >
                <div className="rounded-full bg-muted p-4">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-lg">Перетащите видео сюда</p>
                  <p className="text-muted-foreground text-sm">
                    или нажмите для выбора файла
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  MP4, MOV, AVI, WebM до 100 MB
                </p>
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
