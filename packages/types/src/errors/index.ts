/**
 * Application error taxonomy.
 *
 * Every error crossing a boundary (Server Action, tRPC procedure, background
 * job) carries a stable machine-readable `code`. The client switches on the
 * code; the human-readable message is free to change without breaking callers.
 */
export const APP_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'INTEGRATION_FAILED',
  'INTERNAL',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export interface AppErrorOptions {
  /** Structured, non-sensitive detail safe to send to the client. */
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
  }

  static unauthenticated(message = 'Authentication required.'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have access to this resource.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(resource: string): AppError {
    return new AppError('NOT_FOUND', `${resource} was not found.`);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('VALIDATION_FAILED', message, details ? { details } : {});
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** HTTP status mapping, used by the tRPC error formatter and route handlers. */
export const ERROR_STATUS: Readonly<Record<AppErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 402,
  INTEGRATION_FAILED: 502,
  INTERNAL: 500,
};
