"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TimeInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  min?: number;
};

// Parse time input: "5.5", "1:30", "1:30.5" -> seconds
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Format: MM:SS or MM:SS.m
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;

    const mins = Number.parseInt(parts[0], 10);
    const secs = Number.parseFloat(parts[1]);

    if (Number.isNaN(mins) || Number.isNaN(secs)) return null;
    if (mins < 0 || secs < 0 || secs >= 60) return null;

    return mins * 60 + secs;
  }

  // Format: SS or SS.m
  const secs = Number.parseFloat(trimmed);
  if (Number.isNaN(secs) || secs < 0) return null;

  return secs;
}

// Format seconds -> "MM:SS.m" or "SS.m"
function formatTimeInput(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const ms = Math.floor((secs % 1) * 10);
  const secsInt = Math.floor(secs);

  if (mins > 0) {
    return `${mins}:${secsInt.toString().padStart(2, "0")}.${ms}`;
  }
  return `${secsInt}.${ms}`;
}

export function TimeInput({
  label,
  value,
  onChange,
  max,
  min = 0,
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState(formatTimeInput(value));
  const [isFocused, setIsFocused] = useState(false);

  // Update input when external value changes (but not while editing)
  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatTimeInput(value));
    }
  }, [value, isFocused]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);

    const parsed = parseTimeInput(inputValue);
    if (parsed !== null) {
      // Clamp to valid range
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setInputValue(formatTimeInput(clamped));
    } else {
      // Reset to current value on invalid input
      setInputValue(formatTimeInput(value));
    }
  }, [inputValue, min, max, value, onChange]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      }
    },
    []
  );

  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap text-muted-foreground text-xs">
        {label}:
      </Label>
      <Input
        className="h-8 w-20 font-mono text-sm"
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="0:00.0"
        type="text"
        value={inputValue}
      />
    </div>
  );
}
