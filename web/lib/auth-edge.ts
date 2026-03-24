import { isAuthConfigured, SESSION_COOKIE_NAME } from "@/lib/auth-shared";

function base64UrlToBase64(input: string): string {
  return input.replace(/-/g, "+").replace(/_/g, "/");
}

function decodeBase64UrlUtf8(input: string): string {
  const base64 = base64UrlToBase64(input);
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function signPayload(payload: string): Promise<string> {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export { isAuthConfigured };

export async function verifySessionToken(token: string): Promise<boolean> {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = await signPayload(encodedPayload);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return false;
  }

  try {
    const payloadRaw = decodeBase64UrlUtf8(encodedPayload);
    const payload = JSON.parse(payloadRaw) as { exp?: number };

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
