import { useMutation } from "@tanstack/react-query";
import { type TrimVideoRequest, trimVideo } from "../api";

export function useTrimVideo() {
  return useMutation<Blob, Error, TrimVideoRequest>({
    mutationFn: trimVideo,
  });
}
