import { describe, expect, it } from "vitest";
import { compareUrlSortKeys, getUrlSortKey, normalizeRule, OTHERS } from "./sort";

const sortUrls = (urls: string[], rules = {}) =>
  [...urls].sort((a, b) => compareUrlSortKeys(getUrlSortKey(a, rules), getUrlSortKey(b, rules)));

describe("website sort", () => {
  it("keeps the bare domain together before its subdomains", () => {
    expect(
      sortUrls([
        "https://x.com/addyosmani/status/1",
        "https://blog.x.com/en/engineering/2",
        "https://x.com/facetbrowser",
      ]),
    ).toEqual([
      "https://x.com/addyosmani/status/1",
      "https://x.com/facetbrowser",
      "https://blog.x.com/en/engineering/2",
    ]);
  });

  it("orders nested subdomains and paths by prefix first", () => {
    expect(
      sortUrls([
        "https://cdn.x.com/",
        "https://eu.blog.x.com/",
        "https://blog.x.com/a/b",
        "https://blog.x.com/a",
        "https://blog.x.com/b",
      ]),
    ).toEqual([
      "https://blog.x.com/a",
      "https://blog.x.com/a/b",
      "https://blog.x.com/b",
      "https://eu.blog.x.com/",
      "https://cdn.x.com/",
    ]);
  });
});

describe("host sorting rules", () => {
  const rules = { "x.com": ["/", "home", "i/history", OTHERS, "settings"] };

  it("orders rules first, Others alphabetical, trailing rules last; root is a rule too", () => {
    expect(
      sortUrls(
        [
          "https://x.com/settings",
          "https://x.com/spottedinprod",
          "https://x.com/i/history/2",
          "https://x.com/homepage",
          "https://x.com/i/bookmarks",
          "https://x.com/home",
          "https://x.com/addyosmani",
          "https://x.com/",
          "https://y.com/home",
        ],
        rules,
      ),
    ).toEqual([
      "https://x.com/",
      "https://x.com/home",
      "https://x.com/i/history/2",
      "https://x.com/addyosmani",
      "https://x.com/homepage",
      "https://x.com/i/bookmarks",
      "https://x.com/spottedinprod",
      "https://x.com/settings",
      "https://y.com/home",
    ]);
  });

  it("normalizes input to whole path segments", () => {
    expect(normalizeRule(" /i/history/?a=1#b ")).toBe("i/history");
    expect(normalizeRule("https://x.com/home")).toBe("home");
    expect(normalizeRule("/")).toBe("/");
    expect(normalizeRule("  ")).toBe(OTHERS);
  });
});
