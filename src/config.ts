import type { AppConfig, HermesTarget } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

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

function loadProfilesFromDisk(): HermesTarget[] {
  const profilesDir = path.resolve(process.cwd(), "profiles");
  const targets: HermesTarget[] = [];
  
  if (fs.existsSync(profilesDir)) {
    const files = fs.readdirSync(profilesDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = fs.readFileSync(path.join(profilesDir, file), "utf-8");
          const parsed = JSON.parse(content);
          
          if (parsed.id && parsed.baseUrl && parsed.apiKey && parsed.model) {
            targets.push({
              id: parsed.id,
              name: parsed.name,
              baseUrl: normalizeBaseUrl(parsed.baseUrl),
              apiKey: parsed.apiKey,
              model: parsed.model,
              match: Array.isArray(parsed.match) ? parsed.match.map(String) : [],
              systemPrompt: parsed.systemPrompt,
            });
            log("INFO", `Loaded agent profile from ${file}: ${parsed.name || parsed.id}`);
          } else {
            log("WARN", `Skipped profile ${file}: missing required fields (id, baseUrl, apiKey, model)`);
          }
        } catch (e) {
          log("ERROR", `Failed to load profile ${file}: ${e}`);
        }
      }
    }
  }
  return targets;
}

function parseTargets(): HermesTarget[] {
  const diskTargets = loadProfilesFromDisk();
  const raw = process.env.HERMES_TARGETS;
  let envTargets: HermesTarget[] = [];

  if (raw !== undefined && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        envTargets = parsed.map((item, index): HermesTarget => {
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
    } catch (e) {
      log("ERROR", `Failed to parse HERMES_TARGETS from env: ${e}`);
    }
  }

  // Merge targets, disk targets take precedence if IDs conflict
  const mergedMap = new Map<string, HermesTarget>();
  for (const target of envTargets) {
    mergedMap.set(target.id, target);
  }
  for (const target of diskTargets) {
    mergedMap.set(target.id, target);
  }

  const finalTargets = Array.from(mergedMap.values());
  if (finalTargets.length === 0) {
    throw new Error("No Hermes targets configured. Please set HERMES_TARGETS in .env or add profiles to ./profiles/");
  }

  return finalTargets;
}

export function loadConfig(): AppConfig {
  const targets = parseTargets();
  const defaultTargetId = process.env.HERMES_DEFAULT_TARGET ?? targets[0]!.id;

  if (!targets.some((target) => target.id === defaultTargetId)) {
    throw new Error(`HERMES_DEFAULT_TARGET does not match any target: ${defaultTargetId}`);
  }

  let managerConfig: AppConfig["managerConfig"];
  if (process.env.MANAGER_API_KEY && process.env.MANAGER_MODEL) {
    managerConfig = {
      baseUrl: process.env.MANAGER_BASE_URL ? normalizeBaseUrl(process.env.MANAGER_BASE_URL) : "https://api.openai.com/v1",
      apiKey: process.env.MANAGER_API_KEY,
      model: process.env.MANAGER_MODEL,
      systemPrompt: process.env.MANAGER_SYSTEM_PROMPT || "You are a helpful manager agent. You can use tools to delegate tasks to specialized sub-agents. Always try to answer the user's request by utilizing the available agents.",
    };
  }

  return {
    defaultTargetId,
    forceLogin: readBoolean("WECHAT_FORCE_LOGIN", false) || process.argv.includes("--force-login"),
    historyTurns: readInteger("HERMES_HISTORY_TURNS", 6),
    maxReplyChars: readInteger("WECHAT_MAX_REPLY_CHARS", 3500),
    requestTimeoutMs: readInteger("HERMES_REQUEST_TIMEOUT_MS", 600_000),
    targets,
    managerConfig,
  };
}
