const TASKS_BASE_URL = 'https://tasks.hubstaff.com/api/v1';

const headers = {
  'Authorization': `Bearer ${import.meta.env.VITE_HUBSTAFF_TOKEN}`,
  'Accept': '*/*',
  'Content-Type': 'application/json',
};

export interface HubstaffUser {
  id: number;
  name: string;
}

export interface HubstaffLabel {
  id: number;
  name: string;
  color?: string;
  project_id?: number;
}

export interface HubstaffListInfo {
  id: number;
  name: string;
  project_id: number;
  position?: number;
  task_count?: number;
  type?: string;
}

export interface HubstaffTaskRaw {
  id: number;
  subject?: string;
  summary?: string;
  description?: string;
  estimate_hours?: number;
  position?: number;
  author_id?: number;
  assigned_to_id?: number | null;
  assignee_ids?: number[];
  follower_ids?: number[];
  label_ids?: number[];
  list_id?: number;
  list?: HubstaffListInfo;
  status?: string;
  done?: boolean;
  start_on?: string | null;
  due_on?: string | null;
  due_at?: string | null;
  done_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrichedTaskData {
  id: number;
  subject: string;
  description: string;
  estimate_hours: number;
  position: number;
  list_id: number | null;
  board_status: string;
  list_position: number;
  system_status: string;
  done: boolean;
  assignee_ids: number[];
  assignee_names: string[];
  assignee_name: string;
  label_ids: number[];
  label_names: string[];
  author_id: number | null;
  follower_ids: number[];
  start_on: string | null;
  due_on: string | null;
  due_at: string | null;
  due_date: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchOrgId(): Promise<number | null> {
  try {
    const res = await fetch(`${TASKS_BASE_URL}/organizations`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.organizations?.[0]?.id ?? null;
  } catch (error) {
    console.warn('Could not resolve organization id:', error);
    return null;
  }
}

async function fetchMembers(): Promise<HubstaffUser[]> {
  try {
    const orgId = await fetchOrgId();
    if (!orgId) return [];

    const res = await fetch(`${TASKS_BASE_URL}/organizations/${orgId}/members`, { headers });
    if (!res.ok) return [];

    const data = await res.json();
    return data.members || [];
  } catch (error) {
    console.warn('Could not load members:', error);
    return [];
  }
}

async function fetchLabels(projectId: number): Promise<HubstaffLabel[]> {
  try {
    const res = await fetch(`${TASKS_BASE_URL}/projects/${projectId}/labels`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.labels || [];
  } catch (error) {
    console.warn('Could not load labels:', error);
    return [];
  }
}

async function fetchLists(projectId: number): Promise<HubstaffListInfo[]> {
  try {
    const res = await fetch(`${TASKS_BASE_URL}/projects/${projectId}/lists`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.lists || [];
  } catch (error) {
    console.warn('Could not load lists:', error);
    return [];
  }
}

/**
 * Fetch every task for a project with all available metadata resolved:
 * member names, label names, board list names/positions, and dates.
 */
export async function fetchProjectTasksRich(projectId: number): Promise<EnrichedTaskData[]> {
  let allRawTasks: HubstaffTaskRaw[] = [];
  let pageStartId: number | null = null;
  let hasMore = true;

  try {
    const [members, labels, lists] = await Promise.all([
      fetchMembers(),
      fetchLabels(projectId),
      fetchLists(projectId),
    ]);

    const memberNameById = new Map(members.map((m) => [m.id, m.name]));
    const labelNameById = new Map(labels.map((l) => [l.id, l.name]));
    const listById = new Map(lists.map((l) => [l.id, l]));

    while (hasMore) {
      let url = `${TASKS_BASE_URL}/projects/${projectId}/tasks?page_limit=500&include%5B%5D=users`;
      if (pageStartId) {
        url += `&page_start_id=${pageStartId}`;
      }

      const res = await fetch(url, { method: 'GET', headers });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();

      if (data.users && Array.isArray(data.users)) {
        data.users.forEach((u: HubstaffUser) => memberNameById.set(u.id, u.name));
      }

      const pageTasks: HubstaffTaskRaw[] = data.tasks || [];
      allRawTasks = [...allRawTasks, ...pageTasks];

      // Advance the cursor, guarding against a repeating/zero cursor
      const nextPageStartId = data.pagination?.next_page_start_id;
      if (nextPageStartId && nextPageStartId !== pageStartId) {
        pageStartId = nextPageStartId;
      } else {
        hasMore = false;
      }
    }

    // Drop duplicates that can appear across page boundaries
    const uniqueTasks = Array.from(new Map(allRawTasks.map((t) => [t.id, t])).values());

    return uniqueTasks
      .map((t) => {
        const assigneeIds = t.assignee_ids || (t.assigned_to_id ? [t.assigned_to_id] : []);
        const assigneeNames = assigneeIds.map((id) => memberNameById.get(id) || `User #${id}`);

        const labelIds = t.label_ids || [];
        const labelNames = labelIds.map((id) => labelNameById.get(id) || `Label #${id}`);

        const listInfo = t.list_id ? listById.get(t.list_id) : undefined;
        const boardStatus = t.list?.name || listInfo?.name || 'Uncategorized';

        return {
          id: t.id,
          subject: t.subject || t.summary || 'Untitled Task',
          description: t.description || '',
          estimate_hours: Number(t.estimate_hours) || 0,
          position: Number(t.position) || 0,
          list_id: t.list_id ?? null,
          board_status: boardStatus,
          list_position: listInfo?.position ?? 0,
          system_status: t.status || (t.done ? 'done' : 'active'),
          done: Boolean(t.done),
          assignee_ids: assigneeIds,
          assignee_names: assigneeNames,
          assignee_name: assigneeNames.join(', ') || 'Unassigned',
          label_ids: labelIds,
          label_names: labelNames,
          author_id: t.author_id ?? null,
          follower_ids: t.follower_ids || [],
          start_on: t.start_on ?? null,
          due_on: t.due_on ?? null,
          due_at: t.due_at ?? null,
          due_date: t.due_at || t.due_on || null,
          done_at: t.done_at ?? null,
          created_at: t.created_at,
          updated_at: t.updated_at,
        };
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  } catch (error) {
    console.error(`Error fetching rich tasks for project ${projectId}:`, error);
    throw error;
  }
}
