import { describe, expect, test } from "bun:test";
import { parseReelUrl } from "./reel-url";

describe("parseReelUrl", () => {
  test("извлекает shortcode из стандартного URL /reel/", () => {
    expect(parseReelUrl("https://www.instagram.com/reel/ABC123/")).toBe(
      "ABC123"
    );
  });

  test("извлекает shortcode из URL /reels/", () => {
    expect(parseReelUrl("https://www.instagram.com/reels/ABC123/")).toBe(
      "ABC123"
    );
  });

  test("извлекает shortcode из URL поста /p/", () => {
    expect(parseReelUrl("https://www.instagram.com/p/XYZ789/")).toBe("XYZ789");
  });

  test("работает без trailing slash", () => {
    expect(parseReelUrl("https://www.instagram.com/reel/CODE123")).toBe(
      "CODE123"
    );
  });

  test("работает без www", () => {
    expect(parseReelUrl("https://instagram.com/reel/NOWWW")).toBe("NOWWW");
  });

  test("работает с query параметрами", () => {
    expect(
      parseReelUrl("https://www.instagram.com/reel/QUERY1/?igsh=abc123")
    ).toBe("QUERY1");
  });

  test("работает с URL без протокола", () => {
    expect(parseReelUrl("instagram.com/reel/NOPROTO")).toBe("NOPROTO");
    expect(parseReelUrl("www.instagram.com/reel/NOPROTO2")).toBe("NOPROTO2");
  });

  test("возвращает null для невалидного URL", () => {
    expect(parseReelUrl("https://google.com/reel/ABC123")).toBeNull();
    expect(parseReelUrl("https://www.instagram.com/")).toBeNull();
    expect(parseReelUrl("invalid")).toBeNull();
    expect(parseReelUrl("")).toBeNull();
  });

  test("работает с длинными shortcode", () => {
    const longCode = "DDehRTEOiIh";
    expect(parseReelUrl(`https://www.instagram.com/reel/${longCode}/`)).toBe(
      longCode
    );
  });

  test("извлекает shortcode с дефисами и подчёркиваниями", () => {
    expect(parseReelUrl("https://www.instagram.com/reel/ABC_123-xyz/")).toBe(
      "ABC_123-xyz"
    );
  });
});
