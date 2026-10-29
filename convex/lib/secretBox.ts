/**
 * Encrypt small secrets (an agency's SMS account) before they are stored.
 * AES-256-GCM with a key held only in the deployment's environment
 * (NOTIFY_SECRET_KEY, 32 random bytes in base64), so a copy of the database
 * alone does not reveal them. Uses Web Crypto, available in both Convex
 * runtimes.
 *
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64.decode(keyB64.trim());
  if (raw.length !== 32) throw new Error("NOTIFY_SECRET_KEY must be 32 bytes, base64 encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** "v1.<iv>.<ciphertext>", both base64. */
export async function seal(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  return `v1.${b64.encode(iv)}.${b64.encode(ct)}`;
}

export async function open(sealed: string, keyB64: string): Promise<string> {
  const [version, iv, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !ct) throw new Error("Unrecognised sealed value");
  const key = await importKey(keyB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.decode(iv) }, key, b64.decode(ct));
  return new TextDecoder().decode(pt);
}
