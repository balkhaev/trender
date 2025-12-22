import { describe, expect, test } from "bun:test";
import { extractReelMetadatasFromGraphQlPayload } from "./reel-metadata";

describe("extractReelMetadatasFromGraphQlPayload", () => {
  test("извлекает play_count как viewCount + comment_count + caption.text", () => {
    const payload = {
      data: {
        items: [
          {
            shortcode: "ABC1234",
            play_count: 12_345,
            comment_count: 42,
            like_count: 900,
            caption: { text: "hello world" },
          },
        ],
      },
    };

    expect(extractReelMetadatasFromGraphQlPayload(payload)).toEqual([
      {
        id: "ABC1234",
        viewCount: 12_345,
        likeCount: 900,
        commentCount: 42,
        caption: "hello world",
        author: undefined,
        thumbnailUrl: undefined,
      },
    ]);
  });

  test("если play_count нет, берёт video_view_count", () => {
    const payload = {
      data: {
        media: {
          shortcode: "XYZ9999",
          video_view_count: 777,
          comment_count: 1,
        },
      },
    };

    expect(extractReelMetadatasFromGraphQlPayload(payload)).toEqual([
      {
        id: "XYZ9999",
        viewCount: 777,
        likeCount: undefined,
        commentCount: 1,
        caption: undefined,
        author: undefined,
        thumbnailUrl: undefined,
      },
    ]);
  });

  test("поддерживает edge_media_to_caption и owner.username", () => {
    const payload = {
      data: {
        node: {
          shortcode: "CAPTION1",
          owner: { username: "john" },
          edge_media_to_caption: {
            edges: [{ node: { text: "edge caption" } }],
          },
        },
      },
    };

    expect(extractReelMetadatasFromGraphQlPayload(payload)).toEqual([
      {
        id: "CAPTION1",
        viewCount: undefined,
        likeCount: undefined,
        commentCount: undefined,
        caption: "edge caption",
        author: "john",
        thumbnailUrl: undefined,
      },
    ]);
  });

  test("игнорирует объекты с shortcode без полезных полей", () => {
    const payload = {
      data: {
        node: {
          shortcode: "EMPTY1",
        },
      },
    };

    expect(extractReelMetadatasFromGraphQlPayload(payload)).toEqual([]);
  });

  test("дедуплицирует по id и объединяет поля", () => {
    const payload = {
      data: {
        a: {
          shortcode: "DUP1",
          play_count: 100,
        },
        b: {
          shortcode: "DUP1",
          comment_count: 2,
          caption: "text",
        },
      },
    };

    expect(extractReelMetadatasFromGraphQlPayload(payload)).toEqual([
      {
        id: "DUP1",
        viewCount: 100,
        likeCount: undefined,
        commentCount: 2,
        caption: "text",
        author: undefined,
        thumbnailUrl: undefined,
      },
    ]);
  });
});
