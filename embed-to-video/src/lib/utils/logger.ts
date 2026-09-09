/**
 * Structured server logging.
 *
 * Emits one key=value line per event so logs stay greppable:
 *
 *   [resolver] provider=Generic url=https://… status=success sources=2 duration=842ms
 *
 * Never pass a raw URL, cookie, credential or header map to this module — use
 * `sanitizeUrlForLog` first. `redactValue` is a backstop, not the primary
 * defence.
 */

import "server-only";

import { config } from "@/lib/config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Field names whose values are dropped no matter what a caller passes. */
const FORBIDDEN_FIELDS = new Set([
  "cookie",
  "cookies",
  "authorization",
  "auth",
  "token",
  "password",
  "secret",
  "credentials",
  "set-cookie",
  "apikey",
  "api_key",
]);

export type LogFields = Record<string, string | number | boolean | undefined | null>;

function shouldLog(level: LogLevel): boolean {
  const configured = LEVEL_ORDER[config.logLevel as LogLevel] ?? LEVEL_ORDER.info;
  return LEVEL_ORDER[level] >= configured;
}

function formatValue(value: string | number | boolean): string {
  const text = String(value);
  if (text.length === 0) return '""';
  return /[\s"=]/.test(text) ? JSON.stringify(text) : text;
}

function formatFields(fields: LogFields): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) {
      parts.push(`${key}=[redacted]`);
      continue;
    }
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(" ");
}

function emit(level: LogLevel, scope: string, fields: LogFields): void {
  if (!shouldLog(level)) return;
  const line = `[${scope}] ${formatFields(fields)}`.trimEnd();
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
  /** Derive a logger that stamps every line with extra fields. */
  child(scope: string, base?: LogFields): Logger;
}

export function createLogger(scope: string, base: LogFields = {}): Logger {
  return {
    debug: (fields) => emit("debug", scope, { ...base, ...fields }),
    info: (fields) => emit("info", scope, { ...base, ...fields }),
    warn: (fields) => emit("warn", scope, { ...base, ...fields }),
    error: (fields) => emit("error", scope, { ...base, ...fields }),
    child: (childScope, childBase = {}) => createLogger(childScope, { ...base, ...childBase }),
  };
}

export const logger = createLogger("app");
