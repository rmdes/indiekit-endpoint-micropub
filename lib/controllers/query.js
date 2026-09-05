import { IndiekitError } from "@indiekit/error";
import { getCursor } from "@indiekit/util";

import { getConfig, queryConfig } from "../config.js";
import { getMf2Properties, jf2ToMf2 } from "../mf2.js";

/**
 * Query published posts
 * @type {import("express").RequestHandler}
 */
export const queryController = async (request, response, next) => {
  const { application, publication } = request.app.locals;
  const postsCollection = application?.collections?.get("posts");

  try {
    const config = getConfig(application, publication);
    const limit = Number(request.query.limit) || 0;
    const offset = Number(request.query.offset) || 0;
    let { after, before, filter, properties, q, url } = request.query;

    if (!q) {
      throw IndiekitError.badRequest(
        response.locals.__("BadRequestError.missingParameter", "q"),
      );
    }

    // `category` param is used to query `categories` configuration property
    q = q === "category" ? "categories" : String(q);

    // `channel` param is used to query `channels` configuration property
    q = q === "channel" ? "channels" : String(q);

    switch (q) {
      case "config": {
        response.json(config);

        break;
      }

      case "source": {
        if (url) {
          // Return mf2 for a given URL (optionally filtered by properties)
          let postData;

          if (postsCollection) {
            postData = await postsCollection.findOne({
              "properties.url": url,
            });
          }

          if (!postData) {
            throw IndiekitError.badRequest(
              response.locals.__("BadRequestError.missingResource", "post"),
            );
          }

          const mf2 = jf2ToMf2(postData);
          response.json(getMf2Properties(mf2, properties));
        } else {
          // Return mf2 for published posts
          const categoryParam = request.query.category;
          const searchParam = request.query.search;
          const hasExtraFilter = Boolean(categoryParam || searchParam);

          let cursor = {
            items: [],
            hasNext: false,
            hasPrev: false,
          };

          if (postsCollection) {
            if (hasExtraFilter) {
              // Filter by category and/or full-text search
              // Aligns with Micropub-extensions property-value filtering
              const filterQuery = {};
              if (categoryParam) {
                filterQuery["properties.category"] = String(categoryParam);
              }
              if (searchParam) {
                // Escape regex special characters to prevent injection
                const escaped = String(searchParam).replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&",
                );
                filterQuery.$or = [
                  { "properties.name": { $regex: escaped, $options: "i" } },
                  { "properties.content.text": { $regex: escaped, $options: "i" } },
                  { "properties.content": { $regex: escaped, $options: "i" } },
                ];
              }
              const findLimit = limit > 0 ? limit : 40;
              const filteredItems = await postsCollection
                .find(filterQuery)
                .sort({ _id: -1 })
                .limit(findLimit)
                .toArray();
              cursor = {
                items: filteredItems,
                hasNext: false,
                hasPrev: false,
              };
            } else {
              cursor = await getCursor(postsCollection, after, before, limit);
            }
          }

          const items = [];
          for (let item of cursor.items) {
            if (item.properties) {
              items.push(jf2ToMf2(item));
            } else {
              /**
               * @todo Consider better way to handle item with no properties
               * - notify user and remove item from database?
               * - notify user and don’t delete item from database?
               * - fail silently?
               */
              console.warn(`Item ignored because it has no properties`, item);
            }
          }

          response.json({
            items,
            paging: {
              ...(cursor.hasNext && { after: cursor.lastItem }),
              ...(cursor.hasPrev && { before: cursor.firstItem }),
            },
          });
        }

        break;
      }

      default: {
        // Query configuration value (can be filtered, limited and offset)
        if (Object.hasOwn(config, q)) {
          response.json({
            [q]: queryConfig(config[q], { filter, limit, offset }),
          });
        } else {
          throw IndiekitError.notImplemented(
            response.locals.__("NotImplementedError.query", {
              key: "q",
              value: q,
            }),
          );
        }
      }
    }
  } catch (error) {
    next(error);
  }
};
