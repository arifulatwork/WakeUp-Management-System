// Lightweight signed-session helper. Deliberately not a JWT library —
// just HMAC-SHA256 over a JSON payload, base64url encoded. Uses Web
// Crypto (crypto.subtle) because that's available both in normal
// Next.js route handlers (Node) AND in middleware (Edge runtime),
// so the same code verifies the cookie in both places.
//
// IMPORTANT: set SESSION_SECRET in your real .env. The fallback below
// is only for first-run local dev and is NOT safe for anything real.

const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const SESSION_DAYS = 7;

export type SessionPayload = {
  workerId: string;
  name: string;
  role: string; // "manager" | "coordinator" | "admin"
  exp: number; // unix ms
};

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  arr.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const str = atob(padded);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

// Imported once and reused (it used to be re-imported on every single request).
let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey() {
  // A published build without its own secret would accept cookies anyone can forge: refuse to run.
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set. Add a long random value to .env before running in production.");
  }
  return (keyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  ));
}

export async function createSession(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_DAYS * 86400000 };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64).slice().buffer as ArrayBuffer,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "wu_session";
