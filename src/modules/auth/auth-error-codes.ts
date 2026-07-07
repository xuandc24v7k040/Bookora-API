export const AUTH_ERROR_CODES = {
  csrfInvalid: 'CSRF_INVALID',
  turnstileRequired: 'TURNSTILE_REQUIRED',
  turnstileFailed: 'TURNSTILE_FAILED',
  googleAccessDenied: 'google_access_denied',
  googleStateInvalid: 'google_state_invalid',
  googleAuthFailed: 'google_auth_failed',
} as const;

export type GoogleOauthFailureCode =
  | typeof AUTH_ERROR_CODES.googleAccessDenied
  | typeof AUTH_ERROR_CODES.googleStateInvalid
  | typeof AUTH_ERROR_CODES.googleAuthFailed;
