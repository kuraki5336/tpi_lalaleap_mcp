#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, isHttpTransport } from './config.js';
import { ApiClient } from './api-client.js';
import { WriteGuard } from './write-guard.js';
import { registerProjectTools } from './tools/projects.js';
import { registerRequirementTools } from './tools/requirements.js';
import { registerBugTools } from './tools/bugs.js';
import { registerTodoTools } from './tools/todos.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerTagTools } from './tools/tags.js';
import { registerMemberTools } from './tools/members.js';
import { registerSpecStdioTools } from './tools/spec-review.js';
import { registerResources } from './resources.js';

async function main() {
  if (isHttpTransport()) {
    // 1.3.0 起 HTTP（OAuth Resource Server）模式停用：遠端 MCP 改由 Lalaleap 後端（.NET）內建提供，不需要獨立服務。
    // 原始碼（http.ts 等）保留，不再由入口啟動。
    console.error(
      [
        '[mcp] HTTP 模式已停用（lalaleap-mcp-server 1.3.0 起）。',
        '遠端 MCP 現在由 Lalaleap 後端直接提供，不需要啟動本程式、也不需要另外部署：',
        '  claude mcp add --transport http lalaleap https://lalaleap.twkuraki.com/ap2/lalaleap/mcp',
        '本機 stdio 模式（npx lalaleap-mcp-server ＋ LALALEAP_API_TOKEN）仍可使用，移除 --transport http／LALALEAP_TRANSPORT=http 即可。',
      ].join(String.fromCharCode(10))
    );
    process.exit(2);
  }

  const config = loadConfig();
  const apiClient = new ApiClient(config);
  const writeGuard = new WriteGuard(config);

  // Initialize auth (login or set token)
  await apiClient.initialize();

  const server = new McpServer({
    name: 'lalaleap',
    version: '1.3.0',
  });

  // Register all tools
  registerProjectTools(server, apiClient, writeGuard);
  registerRequirementTools(server, apiClient, writeGuard);
  registerBugTools(server, apiClient, writeGuard);
  registerTodoTools(server, apiClient, writeGuard);
  registerSprintTools(server, apiClient);
  registerTagTools(server, apiClient);
  registerMemberTools(server, apiClient);
  registerSpecStdioTools(server, apiClient, writeGuard);

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
