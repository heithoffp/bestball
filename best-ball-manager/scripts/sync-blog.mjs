// Sync blog markdown from the repo's docs/blog/ (authored by the /weekly-blog skill)
// into src/content/blog/ so Vite can bundle it via import.meta.glob.
//
// docs/blog/ is the single source of truth. The dest dir is generated and
// git-ignored. Wired to `predev` and `prebuild` so dev servers and Vercel
// builds always materialize the latest content inside src/.
//
// index.md (the running authoring log) is intentionally NOT a post and is skipped.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');                 // best-ball-manager/
const SRC = resolve(appRoot, '..', 'docs', 'blog');  // <repo>/docs/blog
const DEST = join(appRoot, 'src', 'content', 'blog');

// A post file is a dated markdown file: YYYY-MM-DD-<slug>.md
const POST_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

function main() {
  if (!existsSync(SRC)) {
    console.warn(`[sync-blog] source not found: ${SRC} — nothing to sync.`);
    mkdirSync(DEST, { recursive: true });
    return;
  }

  // Wipe dest so deleted/unpublished posts don't linger in the bundle.
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });

  const files = readdirSync(SRC).filter((f) => POST_RE.test(f));
  for (const f of files) {
    writeFileSync(join(DEST, f), readFileSync(join(SRC, f)));
  }
  console.log(`[sync-blog] copied ${files.length} post(s) → src/content/blog/`);
}

main();
