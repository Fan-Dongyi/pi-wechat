import type { AppConfig, HermesTarget } from "./types.js";

function readBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function readInteger(name: string, fallback: number) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed.endsWith("/v1")) {
    throw new Error(`Hermes baseUrl must include /v1: ${baseUrl}`);
  }

  return trimmed;
}

function parseTargets() {
  const raw = process.env.HERMES_TARGETS;
  if (raw === undefined || raw.trim() === "") {
    throw new Error("HERMES_TARGETS is required");
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("HERMES_TARGETS must be a non-empty JSON array");
  }

  return parsed.map((item, index): HermesTarget => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`HERMES_TARGETS[${index}] must be an object`);
    }

    const target = item as Partial<HermesTarget>;
    const { id, baseUrl, apiKey, model } = target;
    if (!id || !baseUrl || !apiKey || !model) {
      throw new Error(`HERMES_TARGETS[${index}] requires id, baseUrl, apiKey and model`);
    }

    return {
      id,
      name: target.name,
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKey,
      model,
      match: Array.isArray(target.match) ? target.match.map(String) : [],
      systemPrompt: target.systemPrompt,
    };
  });
}

export function loadConfig(): AppConfig {
  const targets = parseTargets();
  const defaultTargetId = process.env.HERMES_DEFAULT_TARGET ?? targets[0]!.id;

  if (!targets.some((target) => target.id === defaultTargetId)) {
    throw new Error(`HERMES_DEFAULT_TARGET does not match any target: ${defaultTargetId}`);
  }

  return {
    defaultTargetId,
    forceLogin: readBoolean("WECHAT_FORCE_LOGIN", false) || process.argv.includes("--force-login"),
    historyTurns: readInteger("HERMES_HISTORY_TURNS", 6),
    maxReplyChars: readInteger("WECHAT_MAX_REPLY_CHARS", 3500),
    requestTimeoutMs: readInteger("HERMES_REQUEST_TIMEOUT_MS", 600_000),
    targets,
  };
}
