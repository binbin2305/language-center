import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { ERROR_HTTP_STATUS, ErrorCode } from '@lc/shared';
import { AppError } from '../errors/app-error';
import { isDuplicateKey } from '../util/is-duplicate-key';

interface Mapped {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

function mapHttp(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 400 && status < 500 ? ErrorCode.VALIDATION_FAILED : ErrorCode.INTERNAL;
  }
}

function httpStatusOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const { status, statusCode } = e as { status?: unknown; statusCode?: unknown };
  for (const v of [status, statusCode]) {
    if (typeof v === 'number' && v >= 400 && v < 500) return v;
  }
  return undefined;
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const mapped = this.map(exception);
    if (mapped.status >= 500) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }
    const error: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: mapped.code,
      message: mapped.message,
    };
    if (mapped.details) error.details = mapped.details;
    host.switchToHttp().getResponse<Response>().status(mapped.status).json({ error });
  }

  private map(e: unknown): Mapped {
    if (e instanceof AppError) {
      return { status: e.status, code: e.code, message: e.message, details: e.details };
    }
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join('.') || '_root';
        if (!(key in fields)) fields[key] = issue.message;
      }
      return {
        status: ERROR_HTTP_STATUS.VALIDATION_FAILED,
        code: ErrorCode.VALIDATION_FAILED,
        message: ErrorCode.VALIDATION_FAILED,
        details: { fields },
      };
    }
    if (e instanceof MongooseError.ValidationError) {
      const fields: Record<string, string> = {};
      for (const [path, err] of Object.entries(e.errors)) fields[path] = err.message;
      return {
        status: ERROR_HTTP_STATUS.VALIDATION_FAILED,
        code: ErrorCode.VALIDATION_FAILED,
        message: ErrorCode.VALIDATION_FAILED,
        details: { fields },
      };
    }
    // A malformed id (e.g. findById('abc')) can never match a document.
    if (e instanceof MongooseError.CastError) {
      return { status: ERROR_HTTP_STATUS.NOT_FOUND, code: ErrorCode.NOT_FOUND, message: ErrorCode.NOT_FOUND };
    }
    if (isDuplicateKey(e)) {
      return {
        status: ERROR_HTTP_STATUS.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: ErrorCode.CONFLICT,
        details: { keys: Object.keys(e.keyValue ?? {}) },
      };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code = mapHttp(status);
      if (status >= 500) return { status: 500, code: ErrorCode.INTERNAL, message: ErrorCode.INTERNAL };
      return { status, code, message: code };
    }
    const status = httpStatusOf(e);
    if (status) {
      const code = mapHttp(status);
      return { status, code, message: code };
    }
    return { status: 500, code: ErrorCode.INTERNAL, message: ErrorCode.INTERNAL };
  }
}
