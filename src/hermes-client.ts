import type { ChatMessage, HermesTarget } from "./types.js";

interface ChatCompletionChoice {
  message?: {
    content?: string | null;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  error?: {
    message?: string;
  };
}

export class HermesClient {
  constructor(
    private readonly target: HermesTarget,
    private readonly timeoutMs: number,
  ) {}

  async complete(messages: ChatMessage[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.target.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.target.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.target.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Hermes API returned HTTP ${response.status}`);
      }

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("Hermes API returned an empty response");
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}
