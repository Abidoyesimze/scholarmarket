/**
 * Generates an RFC 7807 compliant problem details response.
 * @param {Object} options
 * @param {number} options.status - HTTP status code (e.g., 400, 401, 404)
 * @param {string} options.title - Short, human-readable summary of the problem type
 * @param {string} options.detail - Human-readable explanation specific to this occurrence
 * @param {string} [options.type='about:blank'] - URI reference that identifies the problem type
 * @param {string} [options.instance] - URI reference that identifies the specific occurrence
 * @param {Array<Object>} [options.errors=[]] - Optional field-level validation errors
 */
export function problemResponse({ status, title, detail, type = 'about:blank', instance, errors = [] }) {
  const body = {
    type,
    title,
    status,
    detail,
    ...(instance && { instance }),
    ...(errors.length > 0 && { errors }),
  };

  return Response.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

// Typed helper functions for common HTTP error statuses
export const badRequest = (detail = 'Bad Request', errors = [], instance) =>
  problemResponse({ status: 400, title: 'Bad Request', detail, errors, instance });

export const unauthorized = (detail = 'Unauthorized', instance) =>
  problemResponse({ status: 401, title: 'Unauthorized', detail, instance });

export const forbidden = (detail = 'Forbidden', instance) =>
  problemResponse({ status: 403, title: 'Forbidden', detail, instance });

export const notFound = (detail = 'Not Found', instance) =>
  problemResponse({ status: 404, title: 'Not Found', detail, instance });

export const conflict = (detail = 'Conflict', instance) =>
  problemResponse({ status: 409, title: 'Conflict', detail, instance });

export const tooManyRequests = (detail = 'Too Many Requests', instance) =>
  problemResponse({ status: 429, title: 'Too Many Requests', detail, instance });