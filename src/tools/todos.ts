import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';
import type { WriteGuard } from '../write-guard.js';

export function registerTodoTools(server: McpServer, api: ApiClient, guard: WriteGuard) {
  // Tool 8: create_todo (write)
  server.tool(
    'create_todo',
    '在指定專案中建立待辦項目（寫入操作，受白名單與頻率限制保護）',
    {
      pno: z.string().describe('專案編號'),
      title: z.string().describe('待辦標題'),
      content: z.string().optional().describe('待辦內容'),
      priority: z.string().optional().describe('優先度：high / medium（預設）/ low'),
      due_date: z.string().optional().describe('截止日期 YYYY-MM-DD'),
      lane_no: z.string().optional().describe('看板欄位編號（預設第一欄）'),
    },
    async ({ pno, title, content, priority, due_date, lane_no }) => {
      const blocked = guard.check('create_todo', pno);
      if (blocked) {
        return { content: [{ type: 'text' as const, text: blocked }], isError: true };
      }

      try {
        let targetLane = lane_no;
        if (!targetLane) {
          const boardResp = await api.post<{ lanes: any[]; items: any[] }>(
            '/todo/board',
            { pno }
          );
          if (boardResp.success && boardResp.data?.lanes?.length > 0) {
            const sorted = [...boardResp.data.lanes].sort(
              (a, b) => a.sort_order - b.sort_order
            );
            targetLane = sorted[0].lane_no;
          }
        }

        if (!targetLane) {
          return {
            content: [
              { type: 'text' as const, text: '找不到看板欄位，請確認專案已啟用待辦看板' },
            ],
            isError: true,
          };
        }

        const resp = await api.post<{ todo_no: string }>('/todo/item/add', {
          pno,
          lane_no: targetLane,
          title,
          content: content || '',
          priority: priority || 'medium',
          assigned_to: [],
          due_date: due_date || null,
          tags: [],
        });

        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `建立失敗: ${resp.message}` }] };
        }

        guard.record('create_todo', pno);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { todo_no: resp.data.todo_no, title, message: '待辦已建立' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  // Tool 9: list_todos (read)
  server.tool(
    'list_todos',
    '查詢專案的待辦看板（含欄位與項目）',
    {
      pno: z.string().describe('專案編號'),
    },
    async ({ pno }) => {
      try {
        const resp = await api.post<{ lanes: any[]; items: any[] }>(
          '/todo/board',
          { pno }
        );
        if (!resp.success) {
          return { content: [{ type: 'text' as const, text: `錯誤: ${resp.message}` }] };
        }

        const lanes = (resp.data?.lanes || []).map((l: any) => ({
          lane_no: l.lane_no,
          name: l.name,
          color: l.color,
          sort_order: l.sort_order,
        }));

        const items = (resp.data?.items || []).map((i: any) => ({
          todo_no: i.todo_no,
          lane_no: i.lane_no,
          title: i.title,
          content: i.content,
          priority: i.priority,
          due_date: i.due_date,
          create_user: i.create_user,
          create_date: i.create_date,
        }));

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ lanes, items }, null, 2) },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
