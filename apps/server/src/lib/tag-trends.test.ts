import { describe, expect, test } from "bun:test";
import { computeTagTrends, normalizeTags } from "./tag-trends";

describe("normalizeTags", () => {
  test("нормализует, чистит и дедуплицирует", () => {
    expect(
      normalizeTags([
        "  Food  ",
        "#Food",
        "street food",
        "Street   Food",
        "cinematic!",
        "",
        "   ",
      ])
    ).toEqual(["food", "street-food", "cinematic"]);
  });

  test("сохраняет unicode-буквы/цифры, удаляет пунктуацию", () => {
    expect(normalizeTags(["музыка!", "спорт🏋️", "AI/ML"])).toEqual([
      "музыка",
      "спорт",
      "aiml",
    ]);
  });
});

describe("computeTagTrends", () => {
  test("считает frequency и score по ко-встречаемости", () => {
    const trends = computeTagTrends([
      { tags: ["a", "b", "c"] }, // pairs: ab ac bc (each tag score +2)
      { tags: ["a", "b"] }, // pair: ab (a +1, b +1)
      { tags: ["a"] }, // no pairs
      { tags: ["b", "b", "a"] }, // duplicates ignored, pair: ab (a +1, b +1)
    ]);

    const byTag = new Map(trends.map((t) => [t.tag, t]));

    expect(byTag.get("a")).toEqual({ tag: "a", frequency: 4, score: 4 });
    expect(byTag.get("b")).toEqual({ tag: "b", frequency: 3, score: 4 });
    expect(byTag.get("c")).toEqual({ tag: "c", frequency: 1, score: 2 });
  });

  test("видео с одним тегом не увеличивает score, но увеличивает frequency", () => {
    const trends = computeTagTrends([{ tags: ["solo"] }]);
    expect(trends).toEqual([{ tag: "solo", frequency: 1, score: 0 }]);
  });
});
