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
 * Strip port from a URL base string if present.
 * This ensures that BACKEND_PORT is used instead of any port in the configured base URL.
 * @param url - URL that may contain a port
 * @returns URL without port
 */
function stripPortFromBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove the port from the URL
    const baseWithoutPort = `${urlObj.protocol}//${urlObj.hostname}`;
    return baseWithoutPort;
  } catch {
    // If URL parsing fails, return original
    return url;
  }
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

  // Browser-side: if no API base configured, fall back to localhost (never use page origin)
  if (!configuredBase) {
    const localBase = `http://localhost:${BACKEND_PORT}`;
    console.info(
      `[API] No NEXT_PUBLIC_API_BASE configured. Falling back to ${localBase}.`,
    );
    console.info(
      `[API] To use a different API origin, set NEXT_PUBLIC_API_BASE_EXTERNAL or NEXT_PUBLIC_API_BASE in config/main.yaml.`,
    );
    return localBase;
  }

  // If the configured URL uses HTTPS on the backend port (8001), it will fail with
  // ERR_SSL_PROTOCOL_ERROR because the backend only serves HTTP.
  // Automatically switch to HTTP in this case.
  try {
    const urlObj = new URL(configuredBase);
    if (urlObj.protocol === "https:" && urlObj.port === BACKEND_PORT) {
      const httpBase = `http://${urlObj.hostname}:${BACKEND_PORT}`;
      console.info(
        `[API] Configured URL ${configuredBase} uses HTTPS on backend port ${BACKEND_PORT}. Switching to HTTP: ${httpBase}`,
      );
      return httpBase;
    }
  } catch {
    // URL parsing failed, use as-is
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

/**
 * Default fetch options for API calls that include session cookies.
 * Uses 'same-origin' credentials by default (cookies sent automatically for same-origin requests).
 * For cross-origin deployments, use fetchWithCredentials() with credentials: 'include'.
 */
export const defaultFetchOptions: RequestInit = {
  credentials: "same-origin",
};

/**
 * Fetch wrapper that ensures session cookies are included in API requests.
 *
 * For same-origin deployments (recommended): Uses 'same-origin' credentials mode.
 * For cross-origin deployments: Uses 'include' credentials mode to send cookies.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (credentials is set automatically)
 * @returns Fetch response
 */
export async function fetchWithSession(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const mergedOptions: RequestInit = {
    ...defaultFetchOptions,
    ...options,
    // Ensure credentials is always set
    credentials: "include", // Always include for cross-origin; same-origin sends automatically
  };

  return fetch(url, mergedOptions);
}
