export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface HermesTarget {
  id: string;
  name?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  match: string[];
  systemPrompt?: string;
}

export interface AppConfig {
  defaultTargetId: string;
  forceLogin: boolean;
  historyTurns: number;
  maxReplyChars: number;
  requestTimeoutMs: number;
  targets: HermesTarget[];
  managerConfig?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
  };
}

export interface WechatMessage {
  userId: string;
  text: string;
  type?: string;
  raw: Record<string, unknown>;
}
