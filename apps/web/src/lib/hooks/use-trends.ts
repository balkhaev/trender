import { useQuery } from "@tanstack/react-query";
import { getTagTrends, type TagTrendsResponse } from "../trends-api";

export function useTagTrends(hours = 24, limit = 20) {
  return useQuery<TagTrendsResponse>({
    queryKey: ["trends", "tags", hours, limit],
    queryFn: () => getTagTrends({ hours, limit }),
    refetchInterval: 30_000,
  });
}
