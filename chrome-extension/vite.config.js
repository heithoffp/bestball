import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import fs from 'node:fs';
import path from 'node:path';

/**
 * @crxjs regenerates web_accessible_resources from scratch and only picks up
 * the first content script match. This plugin patches the built manifest to
 * add DraftKings (and any future platforms) to the same resource block.
 */
function patchWebAccessibleResources(additionalMatches) {
  return {
    name: 'patch-web-accessible-resources',
    closeBundle() {
      const manifestPath = path.resolve('dist/manifest.json');
      if (!fs.existsSync(manifestPath)) return;
      const built = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!built.web_accessible_resources?.length) return;
      built.web_accessible_resources[0].matches = [
        ...new Set([...built.web_accessible_resources[0].matches, ...additionalMatches]),
      ];
      fs.writeFileSync(manifestPath, JSON.stringify(built, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    patchWebAccessibleResources(['https://www.draftkings.com/*']),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
