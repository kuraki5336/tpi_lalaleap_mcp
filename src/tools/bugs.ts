import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';
import type { WriteGuard } from '../write-guard.js';

export function registerBugTools(server: McpServer, api: ApiClient, guard: WriteGuard) {
  // Tool 6: create_bug (write)
  server.tool(
    'create_bug',
    '在指定專案中建立一筆缺陷（寫入操作，受白名單與頻率限制保護）',
    {
      pno: z.string().describe('專案編號'),
      title: z.string().describe('缺陷標題'),
      describe: z.string().optional().describe('缺陷描述'),
      priority: z.string().optional().describe('優先度：高 / 中（預設）/ 低'),
      serious: z.string().optional().describe('嚴重程度'),
    },
    async ({ pno, title, describe, priority, serious }) => {
      const blocked = guard.check('create_bug', pno);
      if (blocked) {
        return { content: [{ type: 'text' as const, text: blocked }], isError: true };
      }

      try {
        const createResp = await api.post<{ rno: string }>('/bug/add', { pno });
        if (!createResp.success) {
          return { content: [{ type: 'text' as const, text: `建立失敗: ${createResp.message}` }] };
        }
        const rno = createResp.data.rno;

        const editData: any = { pno, rno, title, flag: 'Y' };
        if (describe) editData.describe = describe;
        if (priority) editData.priority = priority;
        if (serious) editData.serious = serious;

        const editResp = await api.post('/bug/edit', editData);
        if (!editResp.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `缺陷已建立 (rno: ${rno})，但更新欄位失敗: ${editResp.message}`,
              },
            ],
          };
        }

        guard.record('create_bug', pno);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ rno, title, message: '缺陷已建立' }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 7: list_bugs (read)
  server.tool(
    'list_bugs',
    '查詢指定專案的缺陷清單',
    {
      pno: z.string().describe('專案編號'),
      page: z.number().optional().describe('頁碼（預設 1）'),
      limit: z.number().optional().describe('每頁筆數（預設 20）'),
    },
    async ({ pno, page, limit }) => {
      try {
        const resp = await api.post('/bug/list', {
          pno,
          page: page || 1,
          limit: limit || 20,
        }, { 'X-Version': '2' });

        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const bugs = (resp.data || []).map((b: any) => ({
          rno: b.rno,
          title: b.title,
          status: b.status,
          priority: b.priority,
          serious: b.serious,
          create_user: b.create_user || b.createUserDetail?.name,
          create_date: b.create_date,
        }));

        const result: any = { bugs };
        if (resp.totalCount !== undefined) result.totalCount = resp.totalCount;

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
