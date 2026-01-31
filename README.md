# @rmdes/indiekit-endpoint-micropub

Micropub endpoint for Indiekit. Enables publishing content to your website using the Micropub protocol.

## Fork Notice

This is a fork of `@indiekit/endpoint-micropub` with a fix for syndication services that require pre-syndication markup.

### Issue Fixed

Services like IndieNews require a `u-syndication` link in your HTML **before** they receive the syndication webmention. The upstream Micropub endpoint strips all `mp-*` properties (including `mp-syndicate-to`) before passing data to the preset's `postTemplate()`.

This fork preserves `mp-syndicate-to` so that:
1. The property reaches the preset's `postTemplate()`
2. The preset can include it in frontmatter (as `mpSyndicateTo` in Eleventy)
3. The theme can render the `u-syndication` link
4. IndieNews (and similar services) can find the link when parsing the webmention

### Technical Details

The change is in `lib/utils.js`:

```javascript
// mp- properties to preserve for the template (needed for pre-syndication markup)
const preserveMpProperties = ["mp-syndicate-to"];

for (let key in templateProperties) {
  if (key.startsWith("mp-") && !preserveMpProperties.includes(key)) {
    delete templateProperties[key];
  }
  // ...
}
```

## Installation

```bash
npm install @rmdes/indiekit-endpoint-micropub
```

### Using npm overrides (recommended)

Add to your `package.json`:

```json
{
  "overrides": {
    "@indiekit/endpoint-micropub": "npm:@rmdes/indiekit-endpoint-micropub@^1.0.0-beta.25"
  }
}
```

This replaces the upstream package with this fork without changing your plugin configuration.

## Options

| Option      | Type     | Description                                                               |
| :---------- | :------- | :------------------------------------------------------------------------ |
| `mountPath` | `string` | Path to listen to Micropub requests. _Optional_, defaults to `/micropub`. |

## Supported endpoint queries

- Configuration: `/micropub?q=config`
- Media endpoint location: `/micropub?q=media-endpoint`
- Available syndication targets (list): `/micropub?q=syndicate-to`
- Supported queries: `/micropub?q=config`
- Supported vocabularies (list): `/micropub?q=post-types`
- Publication categories (list): `/micropub?q=category`
- Previously published posts (list): `/micropub?q=source`
- Source content: `/micropub?q=source&url=WEBSITE_URL`

List queries support `filter`, `limit` and `offset` and parameters. For example, `/micropub?q=source&filter=web&limit=10&offset=10`.

## License

MIT - Original work by Paul Robert Lloyd, syndication fix by Ricardo Mendes.
