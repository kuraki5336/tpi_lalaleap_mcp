import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';

export function registerSprintTools(server: McpServer, api: ApiClient) {
  // Tool 10: list_sprints
  server.tool(
    'list_sprints',
    '查詢專案的迭代清單',
    {
      pno: z.string().describe('專案編號'),
    },
    async ({ pno }) => {
      try {
        const resp = await api.post('/sprint/list', { pno });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const sprints = (resp.data || []).map((s: any) => ({
          spno: s.spno,
          name: s.name,
          start_date: s.start_date,
          end_date: s.end_date,
          target: s.target,
          totCount: s.totCount,
          completionCount: s.completionCount,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(sprints, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
