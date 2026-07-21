const isDev = import.meta.env.DEV;

export const log = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug("[coach]", ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info("[coach]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[coach]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[coach]", ...args);
  },
};

export function captureError(error: unknown, context?: Record<string, unknown>) {
  const details = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  };
  log.error("Captured error", details);
  return details;
}
