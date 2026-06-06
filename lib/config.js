/**
 * Return queryable publication configuration
 * @param {object} application - Application configuration
 * @param {object} publication - Publication configuration
 * @returns {object} Queryable configuration
 */
export const getConfig = (application, publication) => {
  const { mediaEndpoint, url } = application;
  const { categories, channels, postTypes, syndicationTargets } = publication;

  // Supported queries
  const q = [
    "category",
    "channel",
    "config",
    "media-endpoint",
    "post-types",
    "source",
    "syndicate-to",
  ];

  // Ensure syndication targets use absolute URLs. A misconfigured syndicator
  // whose `info` getter throws (e.g. `new URL("")` on an empty instance URL)
  // must not crash the Micropub config query — omit it from the advertised
  // targets instead of letting it take down `q=config`.
  const syndicateTo = [];
  for (const target of syndicationTargets) {
    let info;
    try {
      info = target.info;
    } catch {
      continue;
    }
    if (info?.service?.photo) {
      info.service.photo = new URL(info.service.photo, url).href;
    }
    syndicateTo.push(info);
  }

  return {
    categories,
    channels: Object.entries(channels).map(([uid, channel]) => ({
      uid,
      name: channel.name,
    })),
    "media-endpoint": mediaEndpoint,
    "post-types": Object.values(postTypes).map((postType) => ({
      type: postType.type,
      name: postType.name,
      h: postType.h,
      properties: postType.properties,
      "required-properties": postType["required-properties"],
    })),
    "syndicate-to": syndicateTo,
    q,
  };
};

/**
 * Query config value
 * @param {Array} property - Property to query
 * @param {object} options - List options (filter, limit, offset)
 * @param {string} [options.filter] - Value to filter items by
 * @param {number} [options.limit] - Limit of items to return
 * @param {number} [options.offset] - Offset to start limit of items
 * @returns {Array} Updated config property
 */
export const queryConfig = (property, options) => {
  const { filter, limit } = options;

  if (!Array.isArray(property)) {
    return property;
  }

  let properties = property || [];

  if (filter) {
    properties = properties.filter((item) => {
      item = JSON.stringify(item);
      item = item.toLowerCase();
      return item.includes(filter);
    });
  }

  if (limit) {
    const offset = options.offset || 0;
    properties = properties.slice(offset, offset + limit);
    properties.length = Math.min(properties.length, limit);
  }

  return properties;
};
