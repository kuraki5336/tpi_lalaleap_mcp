#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { ApiClient } from './api-client.js';
import { WriteGuard } from './write-guard.js';
import { registerProjectTools } from './tools/projects.js';
import { registerRequirementTools } from './tools/requirements.js';
import { registerBugTools } from './tools/bugs.js';
import { registerTodoTools } from './tools/todos.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerTagTools } from './tools/tags.js';
import { registerMemberTools } from './tools/members.js';
import { registerResources } from './resources.js';

async function main() {
  const config = loadConfig();
  const apiClient = new ApiClient(config);
  const writeGuard = new WriteGuard(config);

  // Initialize auth (login or set token)
  await apiClient.initialize();

  const server = new McpServer({
    name: 'lalaleap',
    version: '1.0.0',
  });

  // Register all tools
  registerProjectTools(server, apiClient, writeGuard);
  registerRequirementTools(server, apiClient, writeGuard);
  registerBugTools(server, apiClient, writeGuard);
  registerTodoTools(server, apiClient, writeGuard);
  registerSprintTools(server, apiClient);
  registerTagTools(server, apiClient);
  registerMemberTools(server, apiClient);

  // Register resources
  registerResources(server, apiClient);

  // Start server via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP Server 啟動失敗:', err.message || err);
  process.exit(1);
});
