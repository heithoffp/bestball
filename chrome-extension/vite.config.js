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

/**
 * Firefox MV3 validator (web-ext sign / AMO) requires `background.scripts` to
 * be present alongside `background.service_worker`, even when strict_min_version
 * targets Firefox 121+ where service_worker is the actual runtime entrypoint.
 * @crxjs only emits service_worker. We add the matching scripts entry post-build
 * so the same artifact passes Mozilla validation. Chrome ignores `scripts` when
 * `service_worker` is present; Firefox 121+ uses service_worker; older Firefox
 * (excluded by strict_min_version) would have used scripts. Required by ADR-006.
 */
function patchBackgroundScriptsFallback() {
  return {
    name: 'patch-background-scripts-fallback',
    closeBundle() {
      const manifestPath = path.resolve('dist/manifest.json');
      if (!fs.existsSync(manifestPath)) return;
      const built = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const sw = built.background?.service_worker;
      if (!sw || built.background.scripts) return;
      built.background.scripts = [sw];
      fs.writeFileSync(manifestPath, JSON.stringify(built, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    patchWebAccessibleResources(['https://www.draftkings.com/*']),
    patchBackgroundScriptsFallback(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
