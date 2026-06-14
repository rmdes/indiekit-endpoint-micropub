import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHasImages, getPostTemplateProperties } from "../lib/utils.js";

test("detectHasImages: photo property present", () => {
  assert.equal(detectHasImages({ photo: ["https://x/y.jpg"] }), true);
  assert.equal(
    detectHasImages({ photo: [{ url: "https://x/y.jpg", alt: "a" }] }),
    true,
  );
  assert.equal(detectHasImages({ photo: [] }), false); // empty photo array → no image
});

test("detectHasImages: markdown image in JF2 content {text, html}", () => {
  assert.equal(
    detectHasImages({
      content: {
        text: "see ![alt](/a.jpg)",
        html: "<p>see <img src=/a.jpg></p>",
      },
    }),
    true,
  );
  assert.equal(
    detectHasImages({
      content: { text: "just words", html: "<p>just words</p>" },
    }),
    false,
  );
});

test("detectHasImages: inline <img> in string content", () => {
  assert.equal(
    detectHasImages({ content: 'hello <img src="/a.jpg">' }),
    true,
  );
  assert.equal(detectHasImages({ content: "plain note" }), false);
});

test("detectHasImages: array content", () => {
  assert.equal(detectHasImages({ content: ["a ![x](/a.jpg) b"] }), true);
});

test("detectHasImages: empty/absent → false", () => {
  assert.equal(detectHasImages({}), false);
  assert.equal(detectHasImages({ content: "" }), false);
});

test("getPostTemplateProperties sets hasImages when an image is present", () => {
  // Photo post: hasImages should be true, post-type stripped
  const photoResult = getPostTemplateProperties({
    photo: ["https://x/y.jpg"],
    "post-type": "photo",
  });
  assert.equal(photoResult.hasImages, true);
  assert.equal(photoResult["post-type"], undefined);

  // Plain text post: hasImages must NOT be set (absence ≡ false)
  const plainResult = getPostTemplateProperties({
    content: { text: "plain", html: "<p>plain</p>" },
  });
  assert.notEqual(plainResult.hasImages, true);
});

test("detectHasImages: XHTML self-closing <img/>", () => {
  assert.equal(
    detectHasImages({ content: { html: "<p><img/></p>", text: "" } }),
    true,
  );
});

test("detectHasImages: {value} content shape", () => {
  assert.equal(
    detectHasImages({ content: { value: '<img src="/a.jpg">' } }),
    true,
  );
});

test("detectHasImages: no-arg / undefined → false (default param)", () => {
  assert.equal(detectHasImages(), false);
  assert.equal(detectHasImages(undefined), false);
});
