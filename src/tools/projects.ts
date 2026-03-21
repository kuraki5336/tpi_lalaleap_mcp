import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';
import type { WriteGuard } from '../write-guard.js';

export function registerProjectTools(server: McpServer, api: ApiClient, guard: WriteGuard) {
  // Tool 1: list_projects (read)
  server.tool(
    'list_projects',
    '列出使用者可存取的專案清單',
    {},
    async () => {
      try {
        const resp = await api.post<any[]>('/project/list');
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }
        const projects = (resp.data || []).map((p: any) => ({
          pno: p.pno,
          name: p.name,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(projects, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 2: get_project_detail (read)
  server.tool(
    'get_project_detail',
    '取得專案詳細資訊',
    { pno: z.string().describe('專案編號') },
    async ({ pno }) => {
      try {
        const resp = await api.get(`/project/${pno}`);
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(resp.data, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 13: create_project (write)
  server.tool(
    'create_project',
    '建立新專案（寫入操作，受頻率限制保護）',
    {
      name: z.string().describe('專案名稱（最多 20 字）'),
      type: z.string().optional().describe('0 公開（預設）/ 1 私人'),
    },
    async ({ name, type }) => {
      const blocked = guard.check('create_project');
      if (blocked) {
        return { content: [{ type: 'text' as const, text: blocked }], isError: true };
      }

      try {
        const resp = await api.post('/project/add', {
          name,
          type: type || '0',
          member: [],
        });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }
        const pno = resp.data.pno || resp.data.Pno;
        guard.record('create_project', pno);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ pno, message: '專案已建立' }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
