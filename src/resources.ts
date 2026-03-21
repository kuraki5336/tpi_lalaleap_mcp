import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';
import { formatError } from './api-client.js';

export function registerResources(server: McpServer, api: ApiClient) {
  // Resource: projects list (static)
  server.resource(
    'projects',
    'lalaleap://projects',
    { description: '使用者的專案清單', mimeType: 'application/json' },
    async () => {
      try {
        const resp = await api.post('/project/list');
        const projects = (resp.data || []).map((p: any) => ({
          pno: p.pno,
          name: p.name,
        }));
        return {
          contents: [
            {
              uri: 'lalaleap://projects',
              mimeType: 'application/json',
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: 'lalaleap://projects',
              mimeType: 'text/plain',
              text: formatError(err),
            },
          ],
        };
      }
    }
  );

  // Resource template: project requirements (dynamic)
  server.resource(
    'project-requirements',
    new ResourceTemplate('lalaleap://project/{pno}/requirements', { list: undefined }),
    { description: '專案的需求清單', mimeType: 'application/json' },
    async (uri, variables) => {
      const pno = variables.pno as string;
      try {
        const resp = await api.post('/require/list', {
          pno,
          page: 1,
          limit: 100,
        }, { 'X-Version': '2' });
        const requirements = (resp.data || []).map((r: any) => ({
          rno: r.rno,
          title: r.title,
          status: r.status,
          priority: r.priority,
        }));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(requirements, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: formatError(err),
            },
          ],
        };
      }
    }
  );

  // Resource template: project bugs (dynamic)
  server.resource(
    'project-bugs',
    new ResourceTemplate('lalaleap://project/{pno}/bugs', { list: undefined }),
    { description: '專案的缺陷清單', mimeType: 'application/json' },
    async (uri, variables) => {
      const pno = variables.pno as string;
      try {
        const resp = await api.post('/bug/list', {
          pno,
          page: 1,
          limit: 100,
        }, { 'X-Version': '2' });
        const bugs = (resp.data || []).map((b: any) => ({
          rno: b.rno,
          title: b.title,
          status: b.status,
          priority: b.priority,
        }));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(bugs, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: formatError(err),
            },
          ],
        };
      }
    }
  );

  // Resource template: project sprints (dynamic)
  server.resource(
    'project-sprints',
    new ResourceTemplate('lalaleap://project/{pno}/sprints', { list: undefined }),
    { description: '專案的迭代清單', mimeType: 'application/json' },
    async (uri, variables) => {
      const pno = variables.pno as string;
      try {
        const resp = await api.post('/sprint/list', { pno });
        const sprints = (resp.data || []).map((s: any) => ({
          spno: s.spno,
          name: s.name,
          start_date: s.start_date,
          end_date: s.end_date,
        }));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(sprints, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: formatError(err),
            },
          ],
        };
      }
    }
  );

  // Resource template: project members (dynamic)
  server.resource(
    'project-members',
    new ResourceTemplate('lalaleap://project/{pno}/members', { list: undefined }),
    { description: '專案的成員清單', mimeType: 'application/json' },
    async (uri, variables) => {
      const pno = variables.pno as string;
      try {
        const resp = await api.post('/project/member/list', { pno });
        const members = (resp.data || []).map((m: any) => ({
          sno: m.sno,
          name: m.name,
          email: m.email,
          auth: m.auth,
        }));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(members, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: formatError(err),
            },
          ],
        };
      }
    }
  );
}
