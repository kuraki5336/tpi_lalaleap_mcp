import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';

export function registerMemberTools(server: McpServer, api: ApiClient) {
  // Tool 12: list_project_members
  server.tool(
    'list_project_members',
    '查詢專案成員',
    {
      pno: z.string().describe('專案編號'),
    },
    async ({ pno }) => {
      try {
        const resp = await api.post('/project/member/list', { pno });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const members = (resp.data || []).map((m: any) => ({
          sno: m.sno,
          name: m.name,
          email: m.email,
          auth: m.auth,
          job: m.job,
          owner: m.owner,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(members, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
