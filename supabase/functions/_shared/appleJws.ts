// Shared verification for Apple's signed payloads (ADR-028 / TASK-344).
//
// App Store Server Notifications v2 and StoreKit 2 transactions are delivered as
// JWS (JSON Web Signature, ES256) whose protected header carries an `x5c`
// certificate chain: [leaf, intermediate, Apple Root CA - G3]. Trusting a payload
// means (1) verifying that chain terminates at Apple's real root, (2) verifying
// the leaf certificate actually signed the JWS, and only then (3) reading the
// decoded body. Skipping any step lets a forged notification grant Pro to anyone,
// so this module is deliberately strict: any failure throws, nothing is trusted.
//
// The Apple Root CA - G3 is pinned via the APPLE_ROOT_CA_G3 deployment secret
// (PEM or base64 DER), downloaded from https://www.apple.com/certificateauthority/.
// Pinning the root as a secret keeps this repo free of a bundled cert while still
// anchoring trust to a value the attacker cannot control.

import * as x509 from "https://esm.sh/@peculiar/x509@1.12.3";
import * as jose from "https://esm.sh/jose@5.9.6";

const APPLE_ROOT_CA_G3 = Deno.env.get("APPLE_ROOT_CA_G3") ?? "";

function decodeSegment(seg: string): any {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
  );
  return JSON.parse(json);
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// Verify the x5c chain (leaf -> intermediate -> Apple root) and return the leaf
// certificate's public key for JWS signature verification.
async function verifyChain(x5c: string[]): Promise<CryptoKey> {
  if (!APPLE_ROOT_CA_G3) {
    throw new Error("APPLE_ROOT_CA_G3 secret is not configured");
  }
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error("Missing or too-short x5c certificate chain");
  }

  const certs = x5c.map((der) => new x509.X509Certificate(der));
  const now = new Date();
  for (const cert of certs) {
    if (now < cert.notBefore || now > cert.notAfter) {
      throw new Error("Certificate outside its validity window");
    }
  }

  // Each certificate must be signed by the next one up the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    const issuerKey = await certs[i + 1].publicKey.export();
    const ok = await certs[i].verify({ publicKey: issuerKey, signatureOnly: true });
    if (!ok) throw new Error("Broken certificate chain");
  }

  // The presented root must be byte-identical to the pinned Apple Root CA - G3.
  const trustedRoot = new x509.X509Certificate(APPLE_ROOT_CA_G3);
  const presentedRoot = certs[certs.length - 1];
  if (!bytesEqual(presentedRoot.rawData, trustedRoot.rawData)) {
    throw new Error("Chain does not terminate at the trusted Apple root");
  }

  return await certs[0].publicKey.export();
}

// Verify a JWS (App Store notification signedPayload, or a StoreKit 2 transaction
// JWS) and return its decoded JSON body. Throws on any verification failure.
export async function verifyAndDecode(jws: string): Promise<any> {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWS");

  const header = decodeSegment(parts[0]);
  if (header.alg !== "ES256") throw new Error(`Unexpected JWS alg: ${header.alg}`);

  const leafKey = await verifyChain(header.x5c);
  const { payload } = await jose.compactVerify(jws, leafKey);
  return JSON.parse(new TextDecoder().decode(payload));
}
