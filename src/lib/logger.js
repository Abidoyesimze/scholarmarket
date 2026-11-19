import pino from "pino";
import { randomUUID } from "crypto";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.token",
      "*.secret",
      "*.password",
      "*.signedXdr",
      "*.privateKey",
      "*.mnemonic",
    ],
    censor: "[REDACTED]",
  },
  transport: isProduction
    ? undefined // In production, log plain JSON
    : {
        target: "pino-pretty", // In development, log pretty string
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

export function getRequestContext(request) {
  const requestId =
    request.headers?.get?.("x-request-id") ||
    request.headers?.get?.("x-correlation-id") ||
    randomUUID();
  const url = request.url ? new URL(request.url) : null;

  return {
    requestId,
    route: url?.pathname || "unknown",
    method: request.method || "GET",
  };
}

export function withRequestLogger(handler) {
  return async function requestLoggerHandler(request, context) {
    const { requestId, route, method } = getRequestContext(request);
    const requestLogger = logger.child({ requestId, route, method });

    try {
      const response = await handler(request, context, requestLogger);
      if (response?.headers) {
        response.headers.set("x-request-id", requestId);
      }
      return response;
    } catch (error) {
      requestLogger.error({ err: error, requestId }, "Unhandled API request error");
      throw error;
    }
  };
}

export default logger;
