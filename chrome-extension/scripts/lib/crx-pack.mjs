import { createPublicKey, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import crx3 from 'crx3';

export async function deriveExtensionId(privateKeyPath) {
  const pem = await readFile(privateKeyPath, 'utf8');
  const pubKey = createPublicKey({ key: pem, format: 'pem' });
  const der = pubKey.export({ type: 'spki', format: 'der' });
  const hash = createHash('sha256').update(der).digest();
  return [...hash.subarray(0, 16)]
    .map((b) =>
      String.fromCharCode(97 + ((b >> 4) & 0xf)) +
      String.fromCharCode(97 + (b & 0xf)),
    )
    .join('');
}

export async function packCrx({ srcDir, keyPath, crxPath, zipPath }) {
  await crx3([srcDir], {
    keyPath,
    crxPath,
    zipPath,
  });
}
