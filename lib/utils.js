import { getDateTokenValues, isDate, supplant } from "@indiekit/util";
import newbase60 from "newbase60";

import { postTypeCount } from "./post-type-count.js";

/**
 * Decode form-encoded query parameter
 * @param {string} value - Parameter value to decode
 * @returns {string} Decoded string, else original parameter value
 * @example decodeQueryParameter(["foo", "bar"]) => ["foo", "bar"]
 * @example decodeQueryParameter("2024-02-14T13:24:00+0100") => "2024-02-14T13:24:00+0100"
 * @example decodeQueryParameter("https%3A%2F%2Ffoo.bar") => "https://foo.bar"
 * @example decodeQueryParameter("foo+bar") => "foo bar"
 */
export const decodeQueryParameter = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return isDate(value)
    ? decodeURIComponent(value)
    : decodeURIComponent(value.replaceAll("+", " "));
};

/**
 * Detect whether a post carries an image — a `photo` property, or an image in
 * its content (markdown `![](...)` or an inline `<img>`). Used to stamp a
 * `hasImages` frontmatter flag so the Eleventy theme optimizes only
 * image-bearing pages.
 * @param {object} properties - JF2 properties
 * @returns {boolean}
 */
export const detectHasImages = (properties = {}) => {
  const { photo, content } = properties;

  // Non-empty photo array / single photo value
  if (Array.isArray(photo) ? photo.length > 0 : Boolean(photo)) {
    return true;
  }

  // Flatten content to a single string regardless of JF2 shape
  const toText = (c) => {
    if (!c) return "";
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map((item) => toText(item)).join(" ");
    // JF2 object shape: { text, html, value } — priority html > text > value;
    // do not invert this order in a future refactor (html is the rendered form).
    return c.html || c.text || c.value || "";
  };

  return /!\[[^\]]*\]\(|<img[\s>/]/i.test(toText(content));
};

/**
 * Get post template properties
 * @param {object} properties - JF2 properties
 * @returns {object} Template properties
 */
export const getPostTemplateProperties = (properties) => {
  const templateProperties = structuredClone(properties);

  // mp- properties to preserve for the template (needed for pre-syndication markup)
  // mp-syndicate-to must appear in frontmatter so themes can render u-syndication
  // links BEFORE the syndication webmention is sent (required by IndieNews, etc.)
  const preserveMpProperties = new Set(["mp-syndicate-to"]);

  for (let key in templateProperties) {
    // Remove server commands from post template properties
    // Exception: preserve mp-syndicate-to for pre-syndication u-syndication links
    if (key.startsWith("mp-") && !preserveMpProperties.has(key)) {
      delete templateProperties[key];
    }

    // Remove post-type property, only needed internally
    if (key === "post-type") {
      delete templateProperties["post-type"];
    }
  }

  // Stamp hasImages flag when the post contains an image (photo property or
  // inline image in content). Omit entirely when false — absence ≡ false for
  // the Eleventy theme. Detected from original properties before stripping.
  if (detectHasImages(properties)) {
    templateProperties.hasImages = true;
  }

  return templateProperties;
};

/**
 * Render relative path if URL is on publication
 * @param {string} url - External URL
 * @param {string} me - Publication URL
 * @returns {string} Path
 */
export const relativeMediaPath = (url, me) =>
  url.includes(me) ? url.replace(me, "") : url;

/**
 * Render path from URI template and properties
 * @param {string} path - URI template path
 * @param {object} properties - JF2 properties
 * @param {object} application - Application configuration
 * @param {object} publication - Publication configuration
 * @returns {Promise<string>} Path
 */
export const renderPath = async (
  path,
  properties,
  application,
  publication,
) => {
  const dateObject = new Date(properties.published);
  const { locale, timeZone } = application;
  const { slugSeparator } = publication;

  // Add date tokens
  const tokens = getDateTokenValues(properties.published, locale, timeZone);

  // Add day of the year (NewBase60) token
  tokens.D60 = newbase60.DateToSxg(dateObject);

  // Add count of post-type for the day
  const postsCollection = application?.collections?.get("posts");
  const count = await postTypeCount.get(postsCollection, properties);
  tokens.n = count + 1;

  // Add slug token
  tokens.slug = properties.slug;

  // Add channel token
  if (properties.channel) {
    tokens.channel = Array.isArray(properties.channel)
      ? properties.channel.join(slugSeparator)
      : properties.channel;
  }

  // Populate URI template path with properties
  path = supplant(path, tokens);

  return path;
};

/**
 * Convert string to array if not already an array
 * @param {string|Array} object - String or array to convert
 * @returns {Array} Array
 */
export const toArray = (object) => (Array.isArray(object) ? object : [object]);
