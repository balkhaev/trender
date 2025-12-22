type JsonPrimitive = string | number | boolean | null;

type JsonObject = { [key: string]: JsonValue };

type JsonArray = JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type ReelMetadata = {
  id: string;
  caption?: string;
  author?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
};

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is JsonArray {
  return Array.isArray(value);
}

function getString(obj: JsonObject, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function getNumber(obj: JsonObject, key: string): number | null {
  const value = obj[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[,_\s]/g, "");
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | undefined {
  for (const v of values) {
    if (v !== null && v !== undefined) {
      return v;
    }
  }
  return;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: поддерживаем несколько распространённых форматов caption в разных GraphQL/JSON payload.
function extractCaption(media: JsonObject): string | undefined {
  // 1) caption: { text }
  const captionObj = media.caption;
  if (isJsonObject(captionObj)) {
    const text = getString(captionObj, "text");
    if (text && text.trim().length > 0) {
      return text;
    }
  }

  // 2) caption: "..."
  const captionStr = getString(media, "caption");
  if (captionStr && captionStr.trim().length > 0) {
    return captionStr;
  }

  // 3) edge_media_to_caption.edges[0].node.text
  const edgeCaption = media.edge_media_to_caption;
  if (isJsonObject(edgeCaption)) {
    const edges = edgeCaption.edges;
    if (isJsonArray(edges) && edges.length > 0) {
      const first = edges[0];
      if (isJsonObject(first)) {
        const node = first.node;
        if (isJsonObject(node)) {
          const text = getString(node, "text");
          if (text && text.trim().length > 0) {
            return text;
          }
        }
      }
    }
  }

  return;
}

function extractAuthor(media: JsonObject): string | undefined {
  const owner = media.owner;
  if (isJsonObject(owner)) {
    const username = getString(owner, "username");
    if (username) {
      return username;
    }
  }

  const user = media.user;
  if (isJsonObject(user)) {
    const username = getString(user, "username");
    if (username) {
      return username;
    }
  }

  return;
}

function extractThumbnailUrl(media: JsonObject): string | undefined {
  const direct = firstNonNull([
    getString(media, "thumbnailUrl"),
    getString(media, "thumbnail_url"),
    getString(media, "thumbnail_src"),
    getString(media, "display_url"),
    getString(media, "displayUrl"),
  ]);

  if (direct) {
    return direct;
  }

  const imageVersions2 = media.image_versions2;
  if (isJsonObject(imageVersions2)) {
    const candidates = imageVersions2.candidates;
    if (isJsonArray(candidates)) {
      const firstCandidate = candidates[0];
      if (isJsonObject(firstCandidate)) {
        const url = getString(firstCandidate, "url");
        if (url) {
          return url;
        }
      }
    }
  }

  return;
}

function extractLikeCount(media: JsonObject): number | undefined {
  const edgePreview = media.edge_media_preview_like;
  if (isJsonObject(edgePreview)) {
    const count = getNumber(edgePreview, "count");
    if (count !== null) {
      return count;
    }
  }

  const count = firstNonNull([
    getNumber(media, "like_count"),
    getNumber(media, "likes"),
    getNumber(media, "likeCount"),
  ]);

  return count;
}

function extractCommentCount(media: JsonObject): number | undefined {
  const edgeComment = media.edge_media_to_comment;
  if (isJsonObject(edgeComment)) {
    const count = getNumber(edgeComment, "count");
    if (count !== null) {
      return count;
    }
  }

  return firstNonNull([
    getNumber(media, "comment_count"),
    getNumber(media, "comments_count"),
    getNumber(media, "commentCount"),
  ]);
}

function extractViewCount(media: JsonObject): number | undefined {
  return firstNonNull([
    getNumber(media, "play_count"),
    getNumber(media, "plays"),
    getNumber(media, "video_view_count"),
    getNumber(media, "view_count"),
    getNumber(media, "viewCount"),
  ]);
}

function extractShortcode(media: JsonObject): string | null {
  const shortcode = firstNonNull([
    getString(media, "shortcode"),
    getString(media, "code"),
  ]);

  if (!shortcode) {
    return null;
  }

  const trimmed = shortcode.trim();
  if (trimmed.length < 4) {
    return null;
  }

  return trimmed;
}

function extractMetadataCandidate(obj: JsonObject): ReelMetadata | null {
  const id = extractShortcode(obj);
  if (!id) {
    return null;
  }

  const viewCount = extractViewCount(obj);
  const likeCount = extractLikeCount(obj);
  const commentCount = extractCommentCount(obj);
  const caption = extractCaption(obj);
  const author = extractAuthor(obj);
  const thumbnailUrl = extractThumbnailUrl(obj);

  const hasAny =
    viewCount !== undefined ||
    likeCount !== undefined ||
    commentCount !== undefined ||
    caption !== undefined ||
    author !== undefined ||
    thumbnailUrl !== undefined;

  if (!hasAny) {
    return null;
  }

  return {
    id,
    viewCount,
    likeCount,
    commentCount,
    caption,
    author,
    thumbnailUrl,
  };
}

export function extractReelMetadatasFromGraphQlPayload(
  payload: JsonValue
): ReelMetadata[] {
  const results: ReelMetadata[] = [];

  const visit = (value: JsonValue): void => {
    if (isJsonArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (!isJsonObject(value)) {
      return;
    }

    const meta = extractMetadataCandidate(value);
    if (meta) {
      results.push(meta);
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(payload);

  // Дедуп по id: последний wins (обычно более «глубокий» объект богаче данными)
  const byId = new Map<string, ReelMetadata>();
  for (const m of results) {
    const prev = byId.get(m.id);
    if (!prev) {
      byId.set(m.id, m);
      continue;
    }

    byId.set(m.id, {
      id: m.id,
      caption: m.caption ?? prev.caption,
      author: m.author ?? prev.author,
      thumbnailUrl: m.thumbnailUrl ?? prev.thumbnailUrl,
      viewCount: m.viewCount ?? prev.viewCount,
      likeCount: m.likeCount ?? prev.likeCount,
      commentCount: m.commentCount ?? prev.commentCount,
    });
  }

  return Array.from(byId.values());
}
