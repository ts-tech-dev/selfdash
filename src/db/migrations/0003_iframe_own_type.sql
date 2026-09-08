-- iframe embeds move from a link tile's open_mode to their own top-level `iframe`
-- tile type (see src/shared/tileConfig.js). Promote existing rows: flip type,
-- reset open_mode (no longer a meaningful value for this type), and move the
-- embed URL into config.url the way every other panel type stores its target
-- URL — panel tiles don't use the top-level `url` column.
UPDATE tiles
SET type = 'iframe',
    open_mode = 'newtab',
    config_json = json_set(config_json, '$.url', url),
    url = NULL
WHERE type = 'link' AND open_mode = 'iframe';
