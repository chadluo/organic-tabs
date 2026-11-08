import { describe, expect, it } from "vitest";
import { compareUrlSortKeys, getUrlSortKey } from "./sort";

const sortUrls = (urls: string[]) =>
  [...urls].sort((a, b) => compareUrlSortKeys(getUrlSortKey(a), getUrlSortKey(b)));

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
