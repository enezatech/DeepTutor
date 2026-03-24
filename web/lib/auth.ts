import crypto from "node:crypto";
import { isAuthConfigured, isProduction, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth-shared";

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function signPayload(payload: string): string {
  const sessionSecret = getRequiredEnv("APP_SESSION_SECRET");
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(payload)
    .digest("base64url");
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export { isAuthConfigured, isProduction };

export function createSessionToken(username: string): string {
  const payload = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): boolean {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payloadRaw = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadRaw) as { exp?: number };

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function hashPlaintextPassword(plaintextPassword: string): string {
  return crypto.createHash("sha256").update(plaintextPassword).digest("hex");
}

export function verifyLoginCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUsername = getRequiredEnv("APP_LOGIN_USERNAME");
  const expectedPasswordHash = getRequiredEnv("APP_LOGIN_PASSWORD_HASH");

  const submittedPasswordHash = hashPlaintextPassword(password);

  return (
    safeEqual(username, expectedUsername) &&
    safeEqual(submittedPasswordHash, expectedPasswordHash)
  );
}
