export enum ErrorCode {
  UNKNOWN_ERROR = 1000,
  VALIDATION_ERROR = 1001,
  NOT_FOUND = 1002,

  LLM_API_ERROR = 2000,
  LLM_CONNECTION_ERROR = 2001,
  LLM_TIMEOUT_ERROR = 2002,

  FILE_READ_ERROR = 3000,
  FILE_WRITE_ERROR = 3001,
  FILE_NOT_FOUND = 3002,

  CHARACTER_NOT_FOUND = 4000,
  CHAT_NOT_FOUND = 4001,
  WORLD_NOT_FOUND = 4002,
  PRESET_NOT_FOUND = 4003,
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): AppError {
  return new AppError(code, message, details)
}

export function getStatusCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.NOT_FOUND:
    case ErrorCode.CHARACTER_NOT_FOUND:
    case ErrorCode.CHAT_NOT_FOUND:
    case ErrorCode.WORLD_NOT_FOUND:
    case ErrorCode.PRESET_NOT_FOUND:
    case ErrorCode.FILE_NOT_FOUND:
      return 404

    case ErrorCode.VALIDATION_ERROR:
      return 400

    case ErrorCode.LLM_API_ERROR:
    case ErrorCode.LLM_CONNECTION_ERROR:
    case ErrorCode.LLM_TIMEOUT_ERROR:
    case ErrorCode.FILE_READ_ERROR:
    case ErrorCode.FILE_WRITE_ERROR:
      return 500

    default:
      return 500
  }
}
