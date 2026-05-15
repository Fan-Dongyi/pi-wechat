import type { ChatMessage, HermesTarget, WechatMessage } from "./types.js";

const BASE_SYSTEM_PROMPT = [
  "你是一个由 pi-wechat bridge 调度的 Hermes 子 Agent。",
  "上游输入来自微信 iLink Bot SDK，下游回复会直接发送给微信用户。",
  "请完成用户指令，只返回最终可发给用户的结果；如果任务失败，请说明失败原因和下一步建议。",
].join("\n");

export class ConversationStore {
  private readonly conversations = new Map<string, ChatMessage[]>();

  constructor(private readonly historyTurns: number) {}

  buildMessages(target: HermesTarget, message: WechatMessage, routeKeys: string[]) {
    const systemPrompt = [BASE_SYSTEM_PROMPT, target.systemPrompt].filter(Boolean).join("\n\n");
    const userContent = [
      `微信发送者: ${message.userId}`,
      `路由键: ${routeKeys.length > 0 ? routeKeys.join(", ") : "none"}`,
      `消息类型: ${message.type ?? "unknown"}`,
      "",
      "用户指令:",
      message.text,
    ].join("\n");

    return [
      { role: "system", content: systemPrompt } satisfies ChatMessage,
      ...this.readHistory(target.id, message.userId),
      { role: "user", content: userContent } satisfies ChatMessage,
    ];
  }

  append(targetId: string, userId: string, userText: string, assistantText: string) {
    const key = this.key(targetId, userId);
    const current = this.conversations.get(key) ?? [];
    const next: ChatMessage[] = [
      ...current,
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    ];

    this.conversations.set(key, next.slice(-this.historyTurns * 2));
  }

  private readHistory(targetId: string, userId: string) {
    return this.conversations.get(this.key(targetId, userId)) ?? [];
  }

  private key(targetId: string, userId: string) {
    return `${targetId}:${userId}`;
  }
}
