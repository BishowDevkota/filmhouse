/**
 * The real `server-only` package throws unless it is resolved through the
 * `react-server` export condition. Vitest runs plain Node, so it is aliased to
 * this empty module.
 */
export {};
