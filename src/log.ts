export function log(level: "INFO" | "WARN" | "ERROR" | "RECV" | "SEND", message: string) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level}] ${message}`);
}

export function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
