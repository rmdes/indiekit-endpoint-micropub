import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Minimal publication stub with two syndicators:
// one that implements the hook, one that doesn't
function makePublication(hookImpl = {}) {
  return {
    syndicationTargets: [
      {
        name: "with-hooks",
        update: hookImpl.update ?? undefined,
        delete: hookImpl.delete ?? undefined,
        undelete: hookImpl.undelete ?? undefined,
      },
      {
        name: "without-hooks",
        // no lifecycle methods
      },
    ],
    postTemplate: async () => "content",
    store: {
      updateFile: async () => {},
      deleteFile: async () => {},
      createFile: async () => {},
    },
    storeMessageTemplate: () => "msg",
  };
}

describe("callSyndicatorHook via postContent", () => {
  it("calls update() on syndicators that implement it", async () => {
    let called = false;
    const pub = makePublication({
      update: async () => { called = true; },
    });

    const { postContent } = await import("../lib/post-content.js");

    const postData = {
      path: "/test",
      _originalPath: "/test",
      properties: { url: "https://example.com/test", "post-type": "note" },
    };

    await postContent.update(pub, postData, "https://example.com/test");
    assert.ok(called, "update hook should have been called");
  });

  it("does not throw if a syndicator hook fails", async () => {
    const pub = makePublication({
      delete: async () => { throw new Error("AT Protocol down"); },
    });

    const { postContent } = await import("../lib/post-content.js");
    const postData = {
      path: "/test",
      properties: { url: "https://example.com/test", "post-type": "note" },
    };

    await assert.doesNotReject(postContent.delete(pub, postData));
  });

  it("skips syndicators that do not implement the hook", async () => {
    let called = false;
    // Remove hook from the 'with-hooks' syndicator too
    const pub = makePublication({});
    pub.syndicationTargets[0].update = undefined;

    const { postContent } = await import("../lib/post-content.js");
    const postData = {
      path: "/test",
      _originalPath: "/test",
      properties: { url: "https://example.com/test", "post-type": "note" },
    };

    await postContent.update(pub, postData, "https://example.com/test");
    assert.ok(!called, "hook should not have been called");
  });
});
