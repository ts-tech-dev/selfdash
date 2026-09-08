// Embeds an arbitrary URL in a sandboxed <iframe>. Config (url/sizing/aspectRatio/
// height/sandbox) is sanitized server-side by src/shared/tileConfig.js.
export function IframeTile({ tile }) {
  const cfg = tile.config || {};
  const style =
    cfg.sizing === 'height'
      ? { height: `${cfg.height || 400}px`, aspectRatio: 'auto' }
      : { aspectRatio: cfg.aspectRatio || '16/9', height: 'auto' };

  return (
    <div class="tile-iframe-scroll">
      <iframe
        class="tile-iframe-embed"
        src={cfg.url}
        title={tile.title || cfg.url}
        sandbox={cfg.sandbox}
        loading="lazy"
        style={style}
      />
    </div>
  );
}
