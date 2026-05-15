import OpenAI from "openai";
import { log } from "./log.js";
import type { AppConfig, ChatMessage, HermesTarget } from "./types.js";
import { HermesClient } from "./hermes-client.js";

export class ManagerAgent {
  private openai: OpenAI;
  private model: string;
  private systemPrompt: string;

  constructor(
    config: AppConfig,
    private readonly getClient: (targetId: string) => HermesClient
  ) {
    if (!config.managerConfig) {
      throw new Error("ManagerAgent requires managerConfig in AppConfig");
    }

    this.model = config.managerConfig.model;
    this.systemPrompt = config.managerConfig.systemPrompt;
    
    this.openai = new OpenAI({
      baseURL: config.managerConfig.baseUrl,
      apiKey: config.managerConfig.apiKey,
    });
  }

  async runLoop(
    userMessage: string,
    onlineAgents: HermesTarget[],
    history: ChatMessage[] = []
  ): Promise<string> {
    log("INFO", `[Manager] Starting reasoning loop for message: "${userMessage}"`);

    // Build tools from online agents
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = onlineAgents.map((agent) => ({
      type: "function",
      function: {
        name: `ask_${agent.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
        description: `Ask the specialized agent '${agent.name || agent.id}' to perform a task. ${agent.systemPrompt ? "Agent's specialty: " + agent.systemPrompt : ""}`,
        parameters: {
          type: "object",
          properties: {
            instruction: {
              type: "string",
              description: "The detailed instruction or question for this agent.",
            },
          },
          required: ["instruction"],
        },
      },
    }));

    // Map tool names back to agent IDs
    const toolNameToAgentId = new Map(
      onlineAgents.map((agent) => [`ask_${agent.id.replace(/[^a-zA-Z0-9_]/g, "_")}`, agent.id])
    );

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userMessage },
    ];

    const maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      log("INFO", `[Manager] Loop iteration ${iteration}`);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: "auto",
      });

      const responseMessage = response.choices[0]?.message;
      if (!responseMessage) {
        throw new Error("Manager LLM returned an empty response.");
      }

      // Add the assistant's message to the conversation history
      messages.push(responseMessage);

      // If there are no tool calls, the manager has finished reasoning
      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        log("INFO", `[Manager] Finished reasoning.`);
        return responseMessage.content || "Done.";
      }

      // Handle tool calls
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type === "function") {
          const toolName = toolCall.function.name;
          const agentId = toolNameToAgentId.get(toolName);
          
          let toolResult = "";
          try {
            if (!agentId) {
              throw new Error(`Unknown tool/agent: ${toolName}`);
            }

            const args = JSON.parse(toolCall.function.arguments);
            const instruction = args.instruction;
            
            log("INFO", `[Manager] Calling tool ${toolName} with instruction: "${instruction}"`);
            
            const client = this.getClient(agentId);
            // Call the sub-agent
            toolResult = await client.complete([{ role: "user", content: instruction }]);
            
            log("INFO", `[Manager] Tool ${toolName} returned ${toolResult.length} characters.`);
          } catch (error) {
            const errStr = error instanceof Error ? error.message : String(error);
            log("ERROR", `[Manager] Tool ${toolName} failed: ${errStr}`);
            toolResult = `Error executing tool: ${errStr}`;
          }

          // Append tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }
    }

    log("WARN", `[Manager] Reached max iterations (${maxIterations}). Forcing stop.`);
    return "The task was too complex and reached the maximum number of steps. Please try breaking it down.";
  }
}
