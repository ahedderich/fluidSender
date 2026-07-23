import type { H3Event } from 'h3'

/** Stable, documented error codes for the /api/external/v1/* endpoints. */
export type ExternalErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'STORAGE_FAILED'
  | 'LOAD_FAILED'
  | 'JOB_BUSY'
  | 'NOT_FOUND'

export interface ExternalErrorBody {
  error: { code: ExternalErrorCode; message: string }
}

/** Builds the documented `{ error: { code, message } } ` envelope and sets the HTTP
 *  status directly (rather than throwing) — Nitro's default error handler discards
 *  `createError(...).data`, so a thrown error can't deliver a stable `code` field to
 *  the client. Returning this from a route/middleware handler sends it as-is. */
export function externalError(event: H3Event, input: { statusCode: number; code: ExternalErrorCode; message: string }): ExternalErrorBody {
  setResponseStatus(event, input.statusCode)
  return { error: { code: input.code, message: input.message } }
}

/** Catches an error thrown by a shared util (e.g. resolveUploadPath's `createError`,
 *  which still sets `.data.code` for the browser-facing routes) and converts it to
 *  the external API's documented envelope. */
export function toExternalError(event: H3Event, err: unknown): ExternalErrorBody {
  const h3err = err as { statusCode?: number; message?: string; data?: { code?: ExternalErrorCode } }
  const statusCode = h3err?.statusCode ?? 500
  const code = h3err?.data?.code ?? (statusCode >= 500 ? 'STORAGE_FAILED' : 'VALIDATION_FAILED')
  const message = h3err?.message || 'Unexpected error'
  return externalError(event, { statusCode, code, message })
}
