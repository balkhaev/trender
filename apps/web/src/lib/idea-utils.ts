import type { TagTrend } from "./trends-api";

const HASH_PREFIX_REGEX = /^#+/;
const COLLAPSE_WS_REGEX = /\s+/g;
const KEEP_CHARS_REGEX = /[^\p{L}\p{N}_-]+/gu;
const SPLIT_TAGS_REGEX = /[,\n\r\t;]+/g;

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function normalizeOneTag(raw: string): string {
  const trimmed = raw.trim().replace(HASH_PREFIX_REGEX, "");
  if (trimmed.length === 0) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  const collapsed = lower.replace(COLLAPSE_WS_REGEX, "-");
  const cleaned = collapsed.replace(KEEP_CHARS_REGEX, "");
  return cleaned;
}

export function parseIdeaTags(input: string): string[] {
  const parts = input.split(SPLIT_TAGS_REGEX);
  const normalized = parts.map(normalizeOneTag).filter((t) => t.length > 0);
  return uniq(normalized);
}

function tokenize(tag: string): string[] {
  return tag.split(/[-_]+/g).filter((t) => t.length > 0);
}

function countSharedTokens(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = tokenize(b);
  let shared = 0;
  for (const token of bTokens) {
    if (aTokens.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

export type IdeaMatchResult = {
  inputTags: string[];
  matched: string[];
  suggested: TagTrend[];
  finalTags: string[];
};

export function matchIdeaToTrends(
  inputRaw: string,
  trends: TagTrend[],
  options?: { suggestedLimit?: number }
): IdeaMatchResult {
  const inputTags = parseIdeaTags(inputRaw);
  const trendByTag = new Map(trends.map((t) => [t.tag, t]));

  const matched = inputTags.filter((t) => trendByTag.has(t));
  const inputSet = new Set(inputTags);

  const suggestedLimit = options?.suggestedLimit ?? 15;
  const suggested = trends
    .filter((t) => !inputSet.has(t.tag))
    .map((t) => {
      const boost = inputTags.reduce(
        (acc, inputTag) => acc + countSharedTokens(inputTag, t.tag),
        0
      );
      const adjustedScore = t.score + boost * 0.1;
      return { t, adjustedScore };
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) {
        return b.adjustedScore - a.adjustedScore;
      }
      if (b.t.frequency !== a.t.frequency) {
        return b.t.frequency - a.t.frequency;
      }
      return a.t.tag.localeCompare(b.t.tag);
    })
    .slice(0, suggestedLimit)
    .map((x) => x.t);

  return {
    inputTags,
    matched,
    suggested,
    // По умолчанию = ввод пользователя; UI может добавлять/удалять рекомендации локально.
    finalTags: inputTags,
  };
}
