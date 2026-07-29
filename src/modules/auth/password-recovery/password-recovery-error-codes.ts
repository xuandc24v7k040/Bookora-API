export const PASSWORD_RECOVERY_ERROR_CODES = {
  emailNotFound: 'PASSWORD_RESET_EMAIL_NOT_FOUND',
  googleProviderUnsupported: 'PASSWORD_RESET_UNSUPPORTED_GOOGLE_PROVIDER',
  invalidToken: 'PASSWORD_RESET_TOKEN_INVALID',
  expiredToken: 'PASSWORD_RESET_TOKEN_EXPIRED',
  usedToken: 'PASSWORD_RESET_TOKEN_USED',
  revokedToken: 'PASSWORD_RESET_TOKEN_REVOKED',
  tokenConflict: 'PASSWORD_RESET_TOKEN_CONFLICT',
  rateLimited: 'PASSWORD_RESET_RATE_LIMITED',
  sameAsCurrent: 'NEW_PASSWORD_SAME_AS_CURRENT',
} as const;

export type PasswordResetTokenStatus =
  | 'VALID'
  | 'EXPIRED'
  | 'USED'
  | 'REVOKED'
  | 'INVALID';
