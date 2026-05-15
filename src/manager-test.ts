import { loadConfig } from "./config.js";
import { AgentManager } from "./agent-manager.js";
import { HermesClient } from "./hermes-client.js";
import { ManagerAgent } from "./manager-agent.js";
import { log } from "./log.js";

async function main() {
  // Load config
  // Note: Make sure to set MANAGER_API_KEY and MANAGER_MODEL in your .env
  const config = loadConfig();
  
  if (!config.managerConfig) {
    log("ERROR", "Please set MANAGER_API_KEY and MANAGER_MODEL in .env to test the ManagerAgent.");
    process.exit(1);
  }

  // Initialize AgentManager to get online agents
  const agentManager = new AgentManager(config.targets);
  // For testing, we won't start the interval, we'll just check once
  await (agentManager as any).checkAll();
  
  const onlineAgents = agentManager.getOnlineAgents();
  log("INFO", `Found ${onlineAgents.length} online agents.`);

  // Setup client factory
  const clients = new Map(
    config.targets.map((target) => [target.id, new HermesClient(target, config.requestTimeoutMs)])
  );

  const getClient = (id: string) => {
    const client = clients.get(id);
    if (!client) throw new Error(`Client not found for ${id}`);
    return client;
  };

  // Initialize Manager
  const manager = new ManagerAgent(config, getClient);

  // Test query
  const query = "请帮我查一下昨天的数据，然后写个 python 脚本画图。";
  log("INFO", `Testing query: "${query}"`);

  try {
    const response = await manager.runLoop(query, onlineAgents);
    console.log("\n================ MANAGER RESPONSE ================\n");
    console.log(response);
    console.log("\n==================================================\n");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main().catch(console.error);
