type LogPayload = Record<string, unknown> | unknown;

const print = (level: string, payload: LogPayload, message?: string): void => {
  const inferredMessage = typeof payload === "string" ? payload : message ?? "";
  const meta = payload && typeof payload === "object" ? JSON.stringify(payload) : "";
  const line = [`[${level}]`, inferredMessage, meta].filter(Boolean).join(" ");
  // eslint-disable-next-line no-console
  console.log(line);
};

export const logger = {
  info: (payload: LogPayload, message?: string) => print("INFO", payload, message),
  warn: (payload: LogPayload, message?: string) => print("WARN", payload, message),
  error: (payload: LogPayload, message?: string) => print("ERROR", payload, message)
};
