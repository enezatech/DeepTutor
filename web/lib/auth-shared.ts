export const SESSION_COOKIE_NAME = "deeptutor_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.APP_LOGIN_USERNAME &&
      process.env.APP_LOGIN_PASSWORD_HASH &&
      process.env.APP_SESSION_SECRET,
  );
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
