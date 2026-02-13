# CLAUDE.md - Micropub Endpoint Plugin

## Package Overview

**Package Name:** `@rmdes/indiekit-endpoint-micropub`
**Version:** 1.0.0-beta.28
**Type:** Indiekit endpoint plugin
**License:** MIT

This is a fork of `@indiekit/endpoint-micropub` with two critical custom features:

1. **mp-syndicate-to preservation** - Preserves `mp-syndicate-to` in frontmatter for pre-syndication markup
2. **Type-based post type discovery** - Allows custom post types to use `h: "page"` instead of discovery properties

## Why This Fork Exists

### Problem 1: Pre-Syndication Markup

Services like IndieNews require a `u-syndication` link in your HTML **before** they receive the syndication webmention. The upstream Micropub endpoint strips ALL `mp-*` properties (including `mp-syndicate-to`) before passing data to the preset's `postTemplate()`. This means:

- The syndication target is never written to frontmatter
- The theme can't render the `u-syndication` link
- IndieNews (and similar services) can't find the link when parsing the webmention
- Syndication fails

### Solution 1: Preserve mp-syndicate-to

**File:** `lib/utils.js`

```javascript
// mp- properties to preserve for the template (needed for pre-syndication markup)
// mp-syndicate-to must appear in frontmatter so themes can render u-syndication
// links BEFORE the syndication webmention is sent (required by IndieNews, etc.)
const preserveMpProperties = ["mp-syndicate-to"];

for (let key in templateProperties) {
  // Remove server commands from post template properties
  // Exception: preserve mp-syndicate-to for pre-syndication u-syndication links
  if (key.startsWith("mp-") && !preserveMpProperties.includes(key)) {
    delete templateProperties[key];
  }
  // ...
}
```

Now `mp-syndicate-to` reaches the preset, gets written to frontmatter (as `mpSyndicateTo` in Eleventy), and the theme can render the link before syndication happens.

### Problem 2: Custom Post Type Discovery

The external `@paulrobertlloyd/mf2tojf2` library (used by Indiekit) only preserves standard microformat properties during mf2→JF2 conversion. Custom properties like `discovery: "page"` were being stripped, making it impossible for custom post type plugins (like `@rmdes/indiekit-post-type-page`) to trigger type detection.

### Solution 2: Type-Based Discovery

**File:** `lib/post-type-discovery.js`

```javascript
// If post has a custom type (h value) that matches a configured post type
// This allows plugins to use h: "page" or similar for type-based discovery
// instead of requiring a discovery property that survives mf2->JF2 conversion
if (properties.type && properties.type !== "entry" && postTypes[properties.type]) {
  return properties.type;
}
```

Now custom post types can set `h: "page"` in their post type config, and the `type` property survives mf2→JF2 conversion, enabling correct type detection.

## Architecture

### Data Flow

```
Micropub Client (Quill, Indigenous, etc.)
    ↓
POST /micropub (actionController)
    ↓
formEncodedToJf2() or mf2ToJf2()
    ↓ (JF2 properties)
uploadMedia() (if files attached)
    ↓
postData.create() / update() / delete() / undelete()
    ├─ getPostType() ← post-type-discovery.js (uses TYPE-BASED DISCOVERY)
    ├─ normaliseProperties() ← jf2.js
    ├─ renderPath() ← utils.js
    └─ MongoDB posts collection.replaceOne()
    ↓ (postData object)
postContent.create() / update() / delete() / undelete()
    ├─ getPostTemplateProperties() ← utils.js (PRESERVES mp-syndicate-to)
    ├─ postTemplate(templateProperties) ← preset
    └─ store.createFile() / updateFile() / deleteFile()
    ↓
202 Accepted + Location header
```

### Core Files

| File | Purpose |
|------|---------|
| `index.js` | Plugin entry point, mounts routes, registers `posts` collection |
| `lib/controllers/action.js` | Handles POST requests (create/update/delete/undelete) |
| `lib/controllers/query.js` | Handles GET requests (config, source, syndicate-to, etc.) |
| `lib/post-type-discovery.js` | Determines post type from JF2 properties (CUSTOM TYPE-BASED LOGIC) |
| `lib/post-data.js` | MongoDB CRUD operations (create/read/update/delete/undelete) |
| `lib/post-content.js` | Store operations via publication.store (GitHub, GitLab, etc.) |
| `lib/jf2.js` | JF2 normalization, property conversion, syndication target resolution |
| `lib/utils.js` | Path rendering, template property filtering (PRESERVES mp-syndicate-to) |
| `lib/config.js` | Query responses for `?q=config`, `?q=syndicate-to`, etc. |
| `lib/scope.js` | OAuth scope validation (create, update, delete, draft) |
| `lib/update.js` | Micropub update operations (add, replace, delete properties) |
| `lib/media.js` | Media endpoint upload via FormData |
| `lib/mf2.js` | JF2↔mf2 conversion |
| `lib/markdown.js` | Markdown↔HTML conversion (markdown-it + Turndown) |
| `lib/reserved-properties.js` | Micropub reserved properties (access_token, h, action, url) |
| `lib/post-type-count.js` | Daily post count for {n} token in path templates |

## Micropub Protocol Endpoints

### POST /micropub (Action Endpoint)

Handles all Micropub actions via `action` query parameter or `body.action`:

| Action | Scope Required | Description |
|--------|----------------|-------------|
| `create` | `create` or `post` (deprecated) | Create new post |
| `update` | `update` | Update existing post (add/replace/delete operations) |
| `delete` | `delete` | Delete post (soft delete, keeps metadata) |
| `undelete` | `create` | Restore deleted post |

**Draft Mode:** If scope is `draft`, all operations force `post-status: draft`.

**Flow:**
1. Check OAuth scope
2. Parse JF2 from form-encoded or JSON body
3. Upload media files if attached
4. Create/update/delete post data in MongoDB
5. Create/update/delete file in store (GitHub, GitLab, etc.)
6. Return 202 Accepted with Location header

### GET /micropub (Query Endpoint)

Handles all Micropub queries via `?q=` parameter:

| Query | Description | Response |
|-------|-------------|----------|
| `?q=config` | Full configuration (media endpoint, syndication targets, post types, etc.) | JSON object |
| `?q=media-endpoint` | Media endpoint URL | JSON object |
| `?q=syndicate-to` | List of syndication targets | JSON array |
| `?q=post-types` | List of available post types | JSON array |
| `?q=category` | List of categories | JSON array |
| `?q=channel` | List of channels | JSON array |
| `?q=source` | List of published posts (paginated) | mf2 JSON |
| `?q=source&url=URL` | Single post by URL | mf2 JSON |

**Pagination:** Queries support `filter`, `limit`, `offset`, `after`, `before` parameters.

## Post Type Discovery

The fork implements a **custom type-based discovery algorithm** in `lib/post-type-discovery.js`:

### Algorithm Order

1. **Event type** - If `properties.type === "event"`, return `"event"`
2. **Custom h type (FORK FEATURE)** - If `properties.type` matches a configured post type name (and not "entry"), return that type
3. **Standard discovery properties** - Check for `rsvp`, `repost-of`, `like-of`, `in-reply-to`, `video`, `photo`
4. **Custom discovery properties** - Check post type config for `discovery` property
5. **Collection** - If `children` array is populated, return `"collection"`
6. **Article** - If has `name` and `content`, return `"article"`
7. **Note** - Default fallback

### Example: Custom Page Post Type

```javascript
// In @rmdes/indiekit-post-type-page config
{
  type: "page",
  name: "Page",
  h: "entry",  // mf2 h-type (becomes properties.type in JF2)
  post: {
    path: "{slug}/index.md",
    url: "/{slug}/"
  }
}
```

When a Micropub client sends `h=entry` with page-specific properties, the fork's type-based discovery checks:

```javascript
if (properties.type && properties.type !== "entry" && postTypes[properties.type]) {
  return properties.type;  // "page"
}
```

This **does NOT work** for pages because the h-type is still "entry". The actual page discovery requires a different mechanism (like checking URL pattern or custom property).

**GOTCHA:** The comment in `post-type-discovery.js` is misleading. The current code checks `properties.type` (which is the JF2 type, derived from mf2 h-type), NOT a custom `h: "page"` config value. The page plugin likely uses a different mechanism (URL pattern matching, custom property, or explicit type parameter).

## Media Handling

The endpoint supports file uploads via multipart/form-data. Attached files are uploaded to the media endpoint before post creation.

**File:** `lib/media.js`

```javascript
export const uploadMedia = async (mediaEndpoint, token, properties, files) => {
  for await (let [mediaProperty, media] of Object.entries(files)) {
    // Media property may contain one or many media files
    media = Array.isArray(media) ? media : [media];

    for await (const file of media) {
      const { data, name } = file;

      // Create multipart/form-data
      const formData = new FormData();
      formData.append("file", new Blob([data]), name);

      // Upload file via media endpoint
      const response = await fetch(mediaEndpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: formData,
      });

      // Update respective media property with location of upload
      properties[mediaProperty] = properties[mediaProperty] || [];
      properties[mediaProperty].push(response.headers.get("location"));
    }
  }

  return properties;
};
```

**Supported media properties:** `photo`, `video`, `audio`

## Update Operations

The Micropub update action supports three operations:

| Operation | Description | Example |
|-----------|-------------|---------|
| `replace` | Replace entire property value | `{ replace: { content: ["New content"] } }` |
| `add` | Add value to existing property | `{ add: { category: ["tag1", "tag2"] } }` |
| `delete` | Delete property or property values | `{ delete: ["category"] }` or `{ delete: { category: ["tag1"] } }` |

**File:** `lib/update.js`

- `replaceEntries()` - Replaces property values (mf2 input → JF2 storage)
- `addProperties()` - Adds to existing property arrays
- `deleteEntries()` - Removes specific values from property arrays
- `deleteProperties()` - Removes entire properties

## MongoDB Posts Collection

The endpoint registers a `posts` collection in MongoDB to track all published posts.

**Schema:**

```javascript
{
  _id: ObjectId,
  path: "/content/notes/2026-02-12-abc123/index.md",
  properties: {
    type: "entry",
    "post-type": "note",
    published: "2026-02-12T14:30:00.000Z",
    url: "https://rmendes.net/notes/2026/02/12/abc123/",
    content: { text: "...", html: "..." },
    slug: "abc123",
    "post-status": "published",
    "mp-syndicate-to": ["https://bsky.app"],  // PRESERVED by fork
    // ... other JF2 properties
  },
  _deletedProperties: { /* only present for deleted posts */ }
}
```

**Operations:**

- `postData.create()` - `replaceOne({ upsert: true })` on `properties.url`
- `postData.update()` - `replaceOne()` on `properties.url`, stores `_originalPath` if path changed
- `postData.delete()` - `replaceOne()` with minimal properties + `_deletedProperties` snapshot
- `postData.undelete()` - `replaceOne()` with restored `_deletedProperties`

## Configuration

### Installation

```bash
npm install @rmdes/indiekit-endpoint-micropub
```

### Using npm overrides (recommended)

Replace upstream `@indiekit/endpoint-micropub` with this fork:

```json
{
  "overrides": {
    "@indiekit/endpoint-micropub": "npm:@rmdes/indiekit-endpoint-micropub@^1.0.0-beta.28"
  }
}
```

### Plugin Registration

```javascript
import MicropubEndpoint from "@rmdes/indiekit-endpoint-micropub";

export default {
  plugins: [
    new MicropubEndpoint({
      mountPath: "/micropub"  // Optional, defaults to /micropub
    })
  ]
};
```

## Inter-Plugin Relationships

### Works With All Post Types

This endpoint is the **core content creation mechanism** for Indiekit. It works with ALL post type plugins:

- `@indiekit/post-type-note`
- `@indiekit/post-type-article`
- `@indiekit/post-type-photo`
- `@rmdes/indiekit-post-type-page` (requires fork's type-based discovery)
- Any custom post type plugin

### Works With All Syndicators

The endpoint resolves `mp-syndicate-to` UIDs into syndicator instances and **preserves the property in frontmatter** (fork feature):

- `@rmdes/indiekit-syndicator-bluesky`
- `@rmdes/indiekit-syndicator-mastodon`
- `@rmdes/indiekit-syndicator-linkedin`
- `@rmdes/indiekit-syndicator-indienews`

### Works With All Stores

The endpoint calls `publication.store` methods (create/update/delete):

- `@indiekit/store-github`
- `@indiekit/store-gitlab`
- `@indiekit/store-gitea`

### Works With All Presets

The endpoint calls `publication.postTemplate(templateProperties)`:

- `@rmdes/indiekit-preset-eleventy` (receives `mpSyndicateTo` via fork feature)
- `@indiekit/preset-jekyll`
- `@indiekit/preset-hugo`

## Gotchas

### 1. mp-syndicate-to is NOT Automatically Stripped

The fork preserves `mp-syndicate-to` in template properties. Presets MUST handle this property and include it in frontmatter as `mpSyndicateTo` (or equivalent). The Eleventy preset does this correctly.

### 2. Type-Based Discovery Limitations

The current type-based discovery checks `properties.type` (JF2 type from mf2 h-type), not a custom `h` config value. For custom post types like "page", the discovery mechanism likely relies on:

- URL pattern matching (check `renderPath()` output)
- Custom discovery properties that survive mf2→JF2
- Explicit `type` parameter in Micropub request

**TODO:** Investigate how `@rmdes/indiekit-post-type-page` actually triggers type detection.

### 3. Date Handling

All dates in MongoDB are stored as ISO 8601 strings (`new Date().toISOString()`), NOT Date objects. This follows Indiekit's convention for template compatibility with the `| date` Nunjucks filter.

### 4. Soft Deletes

The `delete` action does NOT remove the post from MongoDB. It stores `_deletedProperties` and deletes the file from the store. This allows `undelete` to restore the post.

### 5. Path Changes on Update

If an update changes the post's path (e.g., slug change), the old file is deleted and a new file is created. The `_originalPath` property tracks this for the store operation.

### 6. Daily Post Count Token

The `{n}` token in path templates uses MongoDB to count posts of the same type published on the same day. Without MongoDB, this defaults to `undefined`.

### 7. Content Property Normalization

The endpoint normalizes content to JF2 format with both `text` and `html` representations:

- If only plaintext provided, generates HTML via markdown-it
- If only HTML provided, generates plaintext via Turndown
- Markdown conversion uses typographer and smart quotes enabled

### 8. Slug Generation

Slugs are generated in this order:
1. Use `mp-slug` if provided
2. Use first 5 words of `name` if present
3. Use first 5 characters of MD5 hash of `published` date

## Commands

```bash
# Install dependencies
npm install

# Run in development (with Indiekit)
npm start

# Publish to npm (requires OTP)
npm publish
```

## Debugging

Enable debug output:

```bash
DEBUG=indiekit:endpoint-micropub:* npm start
```

Debug namespaces:
- `indiekit:endpoint-micropub:post-data` - MongoDB operations
- `indiekit:endpoint-micropub:post-content` - Store operations

## Testing

No automated tests are configured. Manual testing against real Micropub clients (Quill, Indigenous) and the Indiekit server is the current approach.

## Related Plugins

### Must Have
- `@indiekit/endpoint-auth` or `@rmdes/indiekit-endpoint-auth` - Authentication (IndieAuth)
- `@indiekit/endpoint-media` - Media uploads
- At least one post type plugin (note, article, photo, etc.)
- At least one preset plugin (Jekyll, Hugo, Eleventy, etc.)
- At least one store plugin (GitHub, GitLab, Gitea)

### Optional
- `@indiekit/endpoint-posts` or `@rmdes/indiekit-endpoint-posts` - Web UI for post management
- `@indiekit/endpoint-syndicate` or `@rmdes/indiekit-endpoint-syndicate` - Manual syndication UI
- Syndicator plugins for automatic syndication

## License

MIT - Original work by Paul Robert Lloyd, custom features by Ricardo Mendes.
