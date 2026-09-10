import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Vikunja: an API token (`Authorization: Bearer tk_...`, needs the `tasks: read_all`
// scope) or a `/login` JWT. `GET /api/v1/tasks` returns every task the caller can see
// — note it's `/tasks`, not `/tasks/all` (that path 400s "Invalid model provided" on
// current Vikunja). An unset due date comes back as the zero time `0001-01-01T00:00:00Z`,
// which we treat as "no due date".

const VIEWS = {
  due: { label: 'Tasks due', run: fetchDue },
  stats: { label: 'Task stats', run: fetchStats },
};

export default class VikunjaIntegration extends BaseIntegration {
  static key = 'vikunja';
  static title = 'Vikunja';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'token', label: 'API Token', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const hasDueDate = (t) => t.due_date && !t.due_date.startsWith('0001-01-01');

async function fetchTasks({ config, http }) {
  const data = await http.fetchJson(
    `${baseOf(config)}/api/v1/tasks?sort_by=due_date&order_by=asc&per_page=100`,
    { headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' } }
  );
  return Array.isArray(data) ? data : [];
}

async function fetchDue(ctx) {
  const tasks = (await fetchTasks(ctx)).filter((t) => !t.done && hasDueDate(t));
  if (tasks.length === 0) return { type: 'list', items: [{ title: 'Nothing due' }] };
  const now = Date.now();
  return {
    type: 'list',
    items: tasks.slice(0, 25).map((t) => {
      const due = new Date(t.due_date).getTime();
      const overdue = due < now;
      return {
        title: t.title,
        subtitle: `${overdue ? 'overdue — ' : 'due '}${new Date(t.due_date).toLocaleDateString()}`,
      };
    }),
  };
}

async function fetchStats(ctx) {
  const tasks = (await fetchTasks(ctx)).filter((t) => !t.done);
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
  const withDue = tasks.filter(hasDueDate);
  const overdue = withDue.filter((t) => new Date(t.due_date).getTime() < now.getTime()).length;
  const dueToday = withDue.filter((t) => {
    const d = new Date(t.due_date).getTime();
    return d >= now.getTime() && d <= endOfToday;
  }).length;
  return {
    type: 'stats',
    items: [
      { label: 'Open tasks', value: tasks.length },
      { label: 'Overdue', value: overdue },
      { label: 'Due today', value: dueToday },
    ],
  };
}
