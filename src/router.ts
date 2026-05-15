import type { AppConfig, HermesTarget } from "./types.js";
import type { AgentManager } from "./agent-manager.js";

const RECIPIENT_KEYS = [
  "toUserId",
  "to_user_id",
  "receiverId",
  "recipientId",
  "chatId",
  "conversationId",
  "roomId",
  "userId",
  "fromUserId",
  "from_user_id",
  "client_id",
];

function collectRouteKeys(raw: Record<string, unknown>) {
  const values = new Set<string>();

  for (const key of RECIPIENT_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      values.add(value.trim());
    }
  }

  return values;
}

export class TargetRouter {
  private readonly defaultTarget: HermesTarget;

  constructor(private readonly config: AppConfig) {
    const defaultTarget = config.targets.find((target) => target.id === config.defaultTargetId);
    if (!defaultTarget) {
      throw new Error(`Default target not found: ${config.defaultTargetId}`);
    }

    this.defaultTarget = defaultTarget;
  }

  resolve(raw: Record<string, unknown>, text?: string, agentManager?: AgentManager) {
    const routeKeys = collectRouteKeys(raw);
    
    // 1. Check for @name mention in text
    if (text && agentManager) {
      const onlineAgents = agentManager.getOnlineAgents();
      for (const agent of onlineAgents) {
        if ((agent.name && text.includes(`@${agent.name}`)) || text.includes(`@${agent.id}`)) {
          return {
            target: agent,
            routeKeys: [...routeKeys],
            isMention: true,
          };
        }
      }
    }

    // 2. Fallback to routeKeys match
    const matched = this.config.targets.find((target) =>
      target.match.some((key) => routeKeys.has(key)),
    );

    return {
      target: matched ?? this.defaultTarget,
      routeKeys: [...routeKeys],
      isMention: false,
    };
  }
}
