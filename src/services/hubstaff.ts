const TASKS_BASE_URL = 'https://tasks.hubstaff.com/api/v1';

let currentAccessToken = import.meta.env.VITE_HUBSTAFF_TOKEN || '';
let currentRefreshToken = import.meta.env.VITE_HUBSTAFF_REFRESH_TOKEN || '';

/** Load tokens from session endpoint or localStorage, overriding hardcoded env */
async function loadTokensFromSession(): Promise<boolean> {
  try {
    // Try server session endpoint first
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        currentAccessToken = data.access_token;
        currentRefreshToken = data.refresh_token || '';
        localStorage.setItem('hubstaff_token', currentAccessToken);
        localStorage.setItem('hubstaff_refresh_token', currentRefreshToken);
        return true;
      }
    }
  } catch { /* ignore */ }

  // Fallback to localStorage
  const storedAccess = localStorage.getItem('hubstaff_access_token') || localStorage.getItem('hubstaff_token');
  const storedRefresh = localStorage.getItem('hubstaff_refresh_token') || localStorage.getItem('hubstaff_refresh_token');
  if (storedAccess) {
    currentAccessToken = storedAccess;
    currentRefreshToken = storedRefresh || '';
    return true;
  }
  return false;
}
let refreshPromise: Promise<string> | null = null;

async function getOrRefreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // Refresh happens server-side (Vercel function / Vite dev middleware) so the
      // client secret never ships to the browser. The server rotates both tokens
      // and updates the HttpOnly session cookies.
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('Refresh token exchange failed:', response.status, errorText);
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      currentAccessToken = data.access_token;
      currentRefreshToken = data.refresh_token || currentRefreshToken;

      try {
        localStorage.setItem('hubstaff_access_token', currentAccessToken);
        localStorage.setItem('hubstaff_refresh_token', currentRefreshToken);
      } catch {
        /* storage may be unavailable */
      }

      return currentAccessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

const getHeaders = () => ({
  'Authorization': `Bearer ${currentAccessToken}`,
  'Accept': '*/*',
  'Content-Type': 'application/json',
});

// Load from session/store first, then attempt refresh
loadTokensFromSession().catch(() => {});

/**
 * Wrapper for fetch that automatically refreshes token on 401 responses
 * and retries the request once
 */
async function fetchWithTokenRefresh(url: string, options: RequestInit = {}): Promise<Response> {
  let token = currentAccessToken;

  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    console.log('Token expired or unauthorized, attempting refresh...');

    token = await getOrRefreshToken();

    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  return response;
}

export const getAssigneeNames = (assigneeIds: number[], userMap: Record<number, string>) => {
  if (!assigneeIds || assigneeIds.length === 0) return 'Unassigned';
  return assigneeIds
    .map((id) => userMap[id] || `User #${id}`)
    .join(', ');
};

// We'll keep the original headers variable for backward compatibility
// during the transition
const headers = getHeaders();

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
    const res = await fetchWithTokenRefresh(`https://tasks.hubstaff.com/api/v1/organizations`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.organizations?.[0]?.id ?? null;
  } catch (error) {
    console.warn('Could not resolve organization id:', error);
    return null;
  }
}

export async function fetchMembers(orgId: string | number): Promise<Record<number, string>> {
  try {
    const response = await fetchWithTokenRefresh(
      `https://tasks.hubstaff.com/api/v1/organizations/${orgId}/members`
    );

    if (!response.ok) {
      console.warn('Failed to fetch members:', response.status);
      return {};
    }

    const data = await response.json();
    const userMap: Record<number, string> = {};

    if (data.members && Array.isArray(data.members)) {
      data.members.forEach((m: { id: number; name?: string; email?: string }) => {
        const userId = Number(m.id);
        if (userId) {
          userMap[userId] = m.name || m.email || `User #${userId}`;
        }
      });
    }

    return userMap;
  } catch (err) {
    console.error('Error fetching members:', err);
    return {};
  }
}

async function fetchLabels(projectId: number): Promise<HubstaffLabel[]> {
  try {
    const res = await fetchWithTokenRefresh(`${TASKS_BASE_URL}/projects/${projectId}/labels`, { headers });
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
    const res = await fetchWithTokenRefresh(`${TASKS_BASE_URL}/projects/${projectId}/lists`, { headers });
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
    const orgId = await fetchOrgId();
    const [members, labels, lists] = await Promise.all([
      fetchMembers(orgId || 163018),
      fetchLabels(projectId),
      fetchLists(projectId),
    ]);

    const memberNameById = new Map<number, string>(Object.entries(members).map(([k, v]) => [Number(k), v]));
    const labelNameById = new Map(labels.map((l) => [l.id, l.name]));
    const listById = new Map(lists.map((l) => [l.id, l]));

    while (hasMore) {
      let url = `${TASKS_BASE_URL}/projects/${projectId}/tasks?page_limit=500&include%5B%5D=users`;
      if (pageStartId) {
        url += `&page_start_id=${pageStartId}`;
      }

      const res = await fetchWithTokenRefresh(url, { method: 'GET', headers });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();

      if (data.users && Array.isArray(data.users)) {
        data.users.forEach((user: { id: number; name?: string; first_name?: string; last_name?: string }) => {
          const userId = Number(user.id);
          if (userId) {
            const fullName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
            memberNameById.set(userId, fullName || `User #${userId}`);
          }
        });
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
        const assigneeIds = (t.assignee_ids || (t.assigned_to_id ? [t.assigned_to_id] : [])).map(Number);
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
