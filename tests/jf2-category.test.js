import { test } from "node:test";
import assert from "node:assert/strict";
import { getCategoryProperty } from "../lib/jf2.js";

// Category Governance, Layer 1 — normalise-on-write at the single write
// chokepoint. Prevents category fragmentation (case-dups, stray whitespace,
// empties) for ALL writes while still allowing genuinely new categories.

test("getCategoryProperty: trims whitespace", () => {
  assert.deepEqual(getCategoryProperty({ category: ["  rss  ", "indieweb "] }, []), [
    "rss",
    "indieweb",
  ]);
});

test("getCategoryProperty: drops empty / whitespace-only entries", () => {
  assert.deepEqual(getCategoryProperty({ category: ["rss", "", "   "] }, []), ["rss"]);
});

test("getCategoryProperty: accepts a single string (not just arrays)", () => {
  assert.deepEqual(getCategoryProperty({ category: "rss" }, []), ["rss"]);
});

test("getCategoryProperty: de-dupes case-insensitively, keeping first casing when no canonical", () => {
  assert.deepEqual(getCategoryProperty({ category: ["Foo", "foo", "FOO"] }, []), ["Foo"]);
});

test("getCategoryProperty: folds to canonical casing when a case-insensitive match exists", () => {
  const canonical = ["RSS", "IndieWeb", "ActivityPub"];
  assert.deepEqual(
    getCategoryProperty({ category: ["rss", "indieweb", "activitypub"] }, canonical),
    ["RSS", "IndieWeb", "ActivityPub"],
  );
});

test("getCategoryProperty: keeps authored casing for unknown categories (new categories allowed)", () => {
  const canonical = ["RSS"];
  assert.deepEqual(getCategoryProperty({ category: ["rss", "Quantum"] }, canonical), [
    "RSS",
    "Quantum",
  ]);
});

test("getCategoryProperty: fold + dedupe — the RSS-vs-rss case collapses to canonical", () => {
  assert.deepEqual(getCategoryProperty({ category: ["rss", "RSS"] }, ["RSS"]), ["RSS"]);
});

test("getCategoryProperty: non-array canonical list (e.g. remote {url}) skips folding, still trims/dedupes", () => {
  assert.deepEqual(
    getCategoryProperty({ category: [" rss ", "rss"] }, { url: "https://example/cats.json" }),
    ["rss"],
  );
});

test("getCategoryProperty: ignores non-string entries defensively", () => {
  assert.deepEqual(getCategoryProperty({ category: ["rss", 5, null, { x: 1 }] }, []), ["rss"]);
});
