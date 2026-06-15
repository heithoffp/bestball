// Pure blog markdown parsing helpers — NO Vite/`import.meta` here.
//
// This module is the single source of truth for how a post's slug and excerpt
// are derived from its markdown. It is imported by BOTH the browser bundle
// (src/utils/blog.js, via Vite) AND the Node build script
// (scripts/prerender-blog.mjs). Keeping the logic here guarantees the prerender
// step emits files at the exact slug the SPA routes to — a divergence would put
// the prerendered HTML at the wrong path and silently break social cards.

/**
 * Minimal YAML-frontmatter parser for the known blog schema:
 *   title (quoted string), date (YYYY-MM-DD), status, image/description (scalars),
 *   topic_tags (inline array), kb_sources (block list — ignored for display).
 * Avoids gray-matter and its Node/Buffer polyfills.
 */
export function parseFrontmatter(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip BOM if present
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: text };

  const [, fm, content] = match;
  const data = {};
  const lines = fm.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();

    // Block list (key: then "  - item" lines) — only kb_sources uses this; skip its items.
    if (value === '') {
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) i++;
      data[key] = [];
      continue;
    }

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    // Strip surrounding quotes from scalars.
    value = value.replace(/^["']|["']$/g, '');
    data[key] = value;
  }

  return { data, content: content.trim() };
}

export function slugFromFilename(path) {
  const file = path.split('/').pop().replace(/\.md$/, '');
  return file.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

// A paragraph that is only a markdown image (e.g. a leading hero) carries no
// prose — strip image syntax and check for residual text before treating it as
// the excerpt/lede source. Keeps a board-hero-led post from yielding an empty
// description.
function hasProse(p) {
  return p.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().length > 0;
}

export function buildExcerpt(content) {
  const firstPara = content
    .replace(/\[INSERT IMAGE:[^\]]*\]/gi, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && hasProse(p));
  if (!firstPara) return '';
  const plain = firstPara
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}…` : plain;
}
