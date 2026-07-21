import type { ErrorCode } from "./errorCodes.js";

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(input: {
    code: ErrorCode;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "HttpError";
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.details = input.details ?? {};
  }
}
