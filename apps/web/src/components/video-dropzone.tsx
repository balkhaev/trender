"use client";

import { Upload, Video, X } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type VideoDropzoneProps = {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
};

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/avi",
  "video/webm",
  "video/quicktime",
];

export function VideoDropzone({
  onFileSelect,
  disabled,
  className,
}: VideoDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setSelectedFile(file);
      onFileSelect(file);
    },
    [previewUrl, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) {
        return;
      }

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled, handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

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
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
  }, [previewUrl]);

  if (selectedFile && previewUrl) {
    return (
      <div className={cn("relative rounded-xl border bg-card", className)}>
        <video
          className="w-full rounded-xl"
          controls
          src={previewUrl}
          style={{ maxHeight: "400px" }}
        >
          <track kind="captions" />
        </video>
        <div className="absolute top-2 right-2">
          <Button
            disabled={disabled}
            onClick={clearSelection}
            size="icon"
            variant="secondary"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Video className="h-4 w-4" />
            <span className="truncate">{selectedFile.name}</span>
            <span className="ml-auto">
              {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <input
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        disabled={disabled}
        id="video-input"
        onChange={handleFileInput}
        type="file"
      />
      <button
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-transparent p-12 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled ? "pointer-events-none opacity-50" : "",
          className
        )}
        disabled={disabled}
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
    </>
  );
}
