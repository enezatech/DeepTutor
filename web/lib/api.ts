// API configuration and utility functions
//
// This module handles API base URL resolution for different deployment scenarios:
// 1. Same-origin deployment (default): API calls go to the same origin as the frontend
// 2. External API deployment: API calls go to a different origin
// 3. Reverse proxy deployment: API calls use same-origin by default (managed HTTPS proxies terminate TLS)
//
// Environment variables:
// - NEXT_PUBLIC_API_BASE_EXTERNAL: External/public API URL (for cross-origin deployments)
// - NEXT_PUBLIC_API_BASE: Internal API URL (for same-origin deployments)
// - NEXT_PUBLIC_BACKEND_PORT: Backend port number (default: 8001)
//
// For reverse proxy deployments (Coolify, Nginx, etc.):
// - Leave API_BASE empty in config/main.yaml for same-origin API calls
// - The frontend will use the same origin as the page, relying on the proxy to route /api/* requests
// - The proxy should terminate TLS and forward requests to the backend via HTTP

// Get API base URL from environment variable
// This is automatically set by start_web.py based on config/main.yaml
// The .env.local file is auto-generated on startup with the correct backend port
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "8001";

/**
 * Get the configured API base URL from environment variables.
 * Returns undefined if neither NEXT_PUBLIC_API_BASE_EXTERNAL nor NEXT_PUBLIC_API_BASE is set.
 * This allows the browser to default to same-origin API calls.
 */
function getConfiguredApiBaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_API_BASE_EXTERNAL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    undefined
  );
}

/**
 * Check if we're in a browser environment and both API env vars are unset.
 */
function isBrowserWithoutApiConfig(): boolean {
  return (
    typeof window !== "undefined" &&
    !process.env.NEXT_PUBLIC_API_BASE_EXTERNAL &&
    !process.env.NEXT_PUBLIC_API_BASE
  );
}

/**
 * Get the page origin for same-origin API calls.
 * Only available in browser environment.
 */
function getPageOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.location.origin;
}

/**
 * Resolve the API base URL to use for API calls.
 *
 * Resolution priority:
 * 1. If NEXT_PUBLIC_API_BASE_EXTERNAL is set, use it (external/cross-origin deployment)
 * 2. If NEXT_PUBLIC_API_BASE is set, use it with auto-fallback logic
 * 3. Default to same-origin (page origin) for reverse proxy deployments
 *
 * Auto-fallback logic:
 * - If configured URL uses HTTPS on internal backend port (8001), fall back to same-origin
 *   This handles cases where managed HTTPS proxies (Coolify) terminate TLS on port 443
 */
function resolveApiBaseUrl(configuredBase: string | undefined): string {
  // Server-side: must use configured value
  if (typeof window === "undefined") {
    if (!configuredBase) {
      // Server-side fallback to localhost with backend port
      return `http://localhost:${BACKEND_PORT}`;
    }
    return configuredBase;
  }

  // Browser-side: use same-origin as default for reverse proxy deployments
  const pageUrl = getPageOrigin();
  if (!pageUrl) {
    // Should not happen in browser, but fallback to localhost
    return `http://localhost:${BACKEND_PORT}`;
  }

  // If no API base configured, default to same-origin (reverse proxy friendly)
  if (!configuredBase) {
    if (isBrowserWithoutApiConfig()) {
      console.info(
        `[API] No NEXT_PUBLIC_API_BASE configured. Using same-origin API base (${pageUrl}) for reverse proxy deployment.`,
      );
      console.info(
        `[API] To use a different API origin, set NEXT_PUBLIC_API_BASE_EXTERNAL or NEXT_PUBLIC_API_BASE in config/main.yaml.`,
      );
    }
    return pageUrl;
  }

  // Apply auto-fallback logic for configured URLs
  try {
    const configuredUrl = new URL(configuredBase);

    const isLikelyTlsPortMismatch =
      configuredUrl.protocol === "https:" &&
      configuredUrl.hostname === new URL(pageUrl).hostname &&
      configuredUrl.port !== "" &&
      configuredUrl.port !== new URL(pageUrl).port;

    const isLikelyInternalHttpsBackendPort =
      configuredUrl.protocol === "https:" &&
      configuredUrl.hostname === new URL(pageUrl).hostname &&
      configuredUrl.port === "8001";

    if (isLikelyInternalHttpsBackendPort) {
      console.warn(
        `[API] Detected HTTPS API base using internal backend port 8001 on current host. Falling back to same-origin API base (${pageUrl}) because managed HTTPS proxies (e.g., Coolify) usually terminate TLS on 443.`,
      );
      console.warn(
        `[API] To fix this permanently, set NEXT_PUBLIC_API_BASE_EXTERNAL to your public HTTPS endpoint (e.g., https://yourdomain.com).`,
      );
      return pageUrl;
    }

    if (isLikelyTlsPortMismatch) {
      console.warn(
        `[API] Detected HTTPS API base with mismatched port (${configuredUrl.port}) on current host. Falling back to same-origin API base (${pageUrl}) to avoid TLS protocol mismatch (e.g., ERR_SSL_PROTOCOL_ERROR).`,
      );
      console.warn(
        `[API] To fix this permanently, set NEXT_PUBLIC_API_BASE_EXTERNAL to the correct externally reachable HTTPS API endpoint.`,
      );
      return pageUrl;
    }
  } catch (error) {
    console.warn(
      `[API] Failed to parse configured API base URL (${configuredBase}). Using value as-is.`,
      error,
    );
  }

  return configuredBase;
}

export const API_BASE_URL = resolveApiBaseUrl(getConfiguredApiBaseUrl());

/**
 * Construct a full API URL from a path
 * @param path - API path (e.g., '/api/v1/knowledge/list')
 * @returns Full URL (e.g., 'http://localhost:8000/api/v1/knowledge/list')
 */
export function apiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Remove trailing slash from base URL if present
  const base = API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;

  return `${base}${normalizedPath}`;
}

/**
 * Construct a WebSocket URL from a path
 * @param path - WebSocket path (e.g., '/api/v1/solve')
 * @returns WebSocket URL (e.g., 'ws://localhost:{backend_port}/api/v1/solve')
 * Note: backend_port is configured in config/main.yaml
 */
export function wsUrl(path: string): string {
  // Security Hardening: Convert http to ws and https to wss.
  // In production environments (where API_BASE_URL starts with https), this ensures secure websockets.
  const base = API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

  // Remove leading slash if present to avoid double slashes
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Remove trailing slash from base URL if present
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  return `${normalizedBase}${normalizedPath}`;
}
