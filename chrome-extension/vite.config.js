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

// NOTE: Firefox MV3 validator (web-ext sign / AMO) wants `background.scripts`
// alongside `background.service_worker`. We previously patched dist/manifest.json
// here to add it, but Chromium MV3 *rejects* a manifest containing
// `background.scripts` ("'background.scripts' requires manifest version of 2 or
// lower"). The same dist/ feeds both the Chromium .zip and the Firefox .xpi, so
// the patch lives in scripts/sign-firefox.mjs now — applied just before web-ext
// sign and reverted afterwards, leaving dist/ Chromium-clean by default.

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
