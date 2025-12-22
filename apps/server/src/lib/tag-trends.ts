export type TagTrendsVideo = {
  tags: string[];
};

export type TagTrend = {
  tag: string;
  score: number;
  frequency: number;
};

const HASH_PREFIX_REGEX = /^#+/;
const COLLAPSE_WS_REGEX = /\s+/g;
const KEEP_CHARS_REGEX = /[^\p{L}\p{N}_-]+/gu;

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeOneTag(raw: string): string {
  const trimmed = raw.trim().replace(HASH_PREFIX_REGEX, "");
  if (trimmed.length === 0) {
    return "";
  }

  // Lowercase, collapse whitespace, keep letters/numbers/_/-
  const lower = trimmed.toLowerCase();
  const collapsed = lower.replace(COLLAPSE_WS_REGEX, "-");
  const cleaned = collapsed.replace(KEEP_CHARS_REGEX, "");

  return cleaned;
}

export function normalizeTags(input: string[]): string[] {
  const normalized = input.map(normalizeOneTag).filter((t) => t.length > 0);

  return uniq(normalized);
}

function addVideoFrequencies(
  freqByTag: Map<string, number>,
  scoreByTag: Map<string, number>,
  tags: string[]
): void {
  for (const tag of tags) {
    freqByTag.set(tag, (freqByTag.get(tag) ?? 0) + 1);
    if (!scoreByTag.has(tag)) {
      scoreByTag.set(tag, 0);
    }
  }
}

function addVideoCooccurrenceScores(
  scoreByTag: Map<string, number>,
  tags: string[]
): void {
  for (let i = 0; i < tags.length; i += 1) {
    for (let j = i + 1; j < tags.length; j += 1) {
      const a = tags[i];
      const b = tags[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      scoreByTag.set(a, (scoreByTag.get(a) ?? 0) + 1);
      scoreByTag.set(b, (scoreByTag.get(b) ?? 0) + 1);
    }
  }
}

export function computeTagTrends(videos: TagTrendsVideo[]): TagTrend[] {
  const scoreByTag = new Map<string, number>();
  const freqByTag = new Map<string, number>();

  for (const video of videos) {
    const tags = normalizeTags(video.tags);
    addVideoFrequencies(freqByTag, scoreByTag, tags);
    addVideoCooccurrenceScores(scoreByTag, tags);
  }

  const tags = uniq([...freqByTag.keys(), ...scoreByTag.keys()]);
  const trends: TagTrend[] = tags.map((tag) => ({
    tag,
    score: scoreByTag.get(tag) ?? 0,
    frequency: freqByTag.get(tag) ?? 0,
  }));

  trends.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    return a.tag.localeCompare(b.tag);
  });

  return trends;
}
