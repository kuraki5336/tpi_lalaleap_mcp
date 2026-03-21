import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';
import type { WriteGuard } from '../write-guard.js';

export function registerRequirementTools(server: McpServer, api: ApiClient, guard: WriteGuard) {
  // Tool 3: create_requirement (write)
  server.tool(
    'create_requirement',
    '在指定專案中建立一筆需求（寫入操作，受白名單與頻率限制保護）',
    {
      pno: z.string().describe('專案編號'),
      title: z.string().describe('需求標題'),
      describe: z.string().optional().describe('需求描述（支援純文字）'),
      priority: z.string().optional().describe('優先度：高 / 中（預設）/ 低'),
      start_date: z.string().optional().describe('起始日期 YYYY-MM-DD'),
      end_date: z.string().optional().describe('結束日期 YYYY-MM-DD'),
    },
    async ({ pno, title, describe, priority, start_date, end_date }) => {
      const blocked = guard.check('create_requirement', pno);
      if (blocked) {
        return { content: [{ type: 'text' as const, text: blocked }], isError: true };
      }

      try {
        const createResp = await api.post<{ rno: string }>('/require/add', { pno });
        if (!createResp.success) {
          return { content: [{ type: 'text' as const, text: `建立失敗: ${createResp.message}` }] };
        }
        const rno = createResp.data.rno;

        const editData: any = { pno, rno, title, flag: 'Y' };
        if (describe) editData.describe = describe;
        if (priority) editData.priority = priority;
        if (start_date) editData.start_date = start_date;
        if (end_date) editData.end_date = end_date;

        const editResp = await api.post('/require/edit', editData);
        if (!editResp.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `需求已建立 (rno: ${rno})，但更新欄位失敗: ${editResp.message}`,
              },
            ],
          };
        }

        guard.record('create_requirement', pno);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ rno, title, message: '需求已建立' }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 4: list_requirements (read)
  server.tool(
    'list_requirements',
    '查詢指定專案的需求清單',
    {
      pno: z.string().describe('專案編號'),
      page: z.number().optional().describe('頁碼（預設 1）'),
      limit: z.number().optional().describe('每頁筆數（預設 20）'),
      keyword: z.string().optional().describe('搜尋關鍵字（標題模糊搜尋）'),
    },
    async ({ pno, page, limit, keyword }) => {
      try {
        const reqData: any = { pno, page: page || 1, limit: limit || 20 };
        if (keyword) {
          reqData.filter = [{ columnType: 'text', columnId: 'title', key: [keyword] }];
        }

        const resp = await api.post('/require/list', reqData, { 'X-Version': '2' });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const requirements = (resp.data || []).map((r: any) => ({
          rno: r.rno,
          title: r.title,
          status: r.status,
          priority: r.priority,
          start_date: r.start_date,
          end_date: r.end_date,
          create_user: r.create_user || r.createUserDetail?.name,
          create_date: r.create_date,
        }));

        const result: any = { requirements };
        if (resp.totalCount !== undefined) result.totalCount = resp.totalCount;

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 5: get_requirement_detail (read)
  server.tool(
    'get_requirement_detail',
    '取得單筆需求的完整資訊',
    {
      pno: z.string().describe('專案編號'),
      rno: z.string().describe('需求編號'),
    },
    async ({ pno, rno }) => {
      try {
        const resp = await api.post('/require/detail', { pno, rno });
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const d = resp.data;
        const detail = {
          rno: d.rno,
          title: d.title,
          describe: d.describe,
          status: d.status,
          priority: d.priority,
          start_date: d.start_date,
          end_date: d.end_date,
          tags: d.tag?.map((t: any) => t.tag_name) || [],
          create_user: d.create_user_name || d.create_user,
          scale: d.scale,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 11: update_requirement (write)
  server.tool(
    'update_requirement',
    '更新需求欄位（寫入操作，受白名單與頻率限制保護）',
    {
      pno: z.string().describe('專案編號'),
      rno: z.string().describe('需求編號'),
      title: z.string().optional().describe('新標題'),
      status: z.string().optional().describe('新狀態'),
      priority: z.string().optional().describe('新優先度'),
      start_date: z.string().optional().describe('起始日期 YYYY-MM-DD'),
      end_date: z.string().optional().describe('結束日期 YYYY-MM-DD'),
      describe: z.string().optional().describe('需求描述'),
    },
    async ({ pno, rno, title, status, priority, start_date, end_date, describe }) => {
      const blocked = guard.check('update_requirement', pno);
      if (blocked) {
        return { content: [{ type: 'text' as const, text: blocked }], isError: true };
      }

      try {
        const editData: any = { pno, rno, flag: 'Y' };
        if (title !== undefined) editData.title = title;
        if (status !== undefined) editData.status = status;
        if (priority !== undefined) editData.priority = priority;
        if (start_date !== undefined) editData.start_date = start_date;
        if (end_date !== undefined) editData.end_date = end_date;
        if (describe !== undefined) editData.describe = describe;

        const resp = await api.post('/require/edit', editData);
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `更新失敗: ${resp.message}` }] };
        }

        guard.record('update_requirement', pno);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ rno, message: '需求已更新' }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
