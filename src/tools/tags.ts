import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';

export function registerTagTools(server: McpServer, api: ApiClient) {
  // Tool 14: search_tags
  server.tool(
    'search_tags',
    '搜尋專案標籤',
    {
      pno: z.string().describe('專案編號'),
      keyword: z.string().optional().describe('搜尋關鍵字'),
    },
    async ({ pno, keyword }) => {
      try {
        const resp = await api.post('/tag/query', {
          pno,
          input: keyword || '',
        });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const tags = (resp.data || []).map((t: any) => ({
          tag_no: t.tag_no,
          tag_name: t.tag_name,
          tag_color: t.tag_color,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tags, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
