import type { WechatMessage } from "./types.js";

export function normalizeWechatMessage(rawMessage: unknown): WechatMessage {
  if (typeof rawMessage !== "object" || rawMessage === null) {
    throw new Error("Unexpected WeChat message shape");
  }

  const raw = rawMessage as Record<string, unknown>;
  const sdkRaw = typeof raw.raw === "object" && raw.raw !== null ? raw.raw : {};
  const userId = readString(raw, "userId") ?? readString(raw, "fromUserId");
  const text = readString(raw, "text") ?? readString(raw, "content") ?? "";
  const type = readString(raw, "type");

  if (!userId) {
    throw new Error("WeChat message is missing userId");
  }

  return {
    userId,
    text: text.trim(),
    type,
    raw: { ...raw, ...(sdkRaw as Record<string, unknown>) },
  };
}

export function truncateForWechat(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 32))}\n\n[回复过长，已截断]`;
}

function readString(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
