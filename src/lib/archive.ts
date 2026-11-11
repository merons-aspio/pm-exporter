import type {
  EnrichedTaskData,
  HubstaffLabel,
  HubstaffListInfo,
  HubstaffTaskRaw,
} from '../services/hubstaff';

export interface ArchiveOrganization {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface ArchiveFolder {
  id: number;
  name: string;
  folder_type?: string;
  organization_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ArchiveMember {
  id: number;
  name?: string;
  email?: string;
  screen_name?: string;
  time_zone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ArchiveProject {
  id: number;
  name: string;
  archived?: boolean;
  organization_id?: number;
  folder_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ArchiveDeepCounts {
  comments: number;
  checklists: number;
  checklistItems: number;
  attachments: number;
  timeEntries: number;
  timeSeconds: number;
  capturedTasks: number;
}

export interface ArchiveProjectSummary {
  id: number;
  name: string;
  archived: boolean;
  organizationId?: number;
  folderId: number | null;
  folderName: string | null;
  createdAt?: string;
  updatedAt?: string;
  accessible: boolean;
  error: string | null;
  coreFile: string;
  deepFile: string;
  taskCount: number;
  activeTaskCount: number;
  removedTaskCount: number;
  listCount: number;
  labelCount: number;
  estimatedHours: number;
  activeEstimatedHours: number;
  deepStatus: 'pending' | 'partial' | 'complete';
  deepCounts: ArchiveDeepCounts;
  deepUpdatedAt: string | null;
}

export interface ArchiveTotals {
  projects: number;
  accessibleProjects: number;
  inaccessibleProjects: number;
  tasks: number;
  activeTasks: number;
  removedTasks: number;
  lists: number;
  labels: number;
  members: number;
  estimatedHours: number;
  comments: number;
  checklists: number;
  checklistItems: number;
  attachments: number;
  timeEntries: number;
  timeSeconds: number;
}

export interface ArchiveManifest {
  version: number;
  source: string;
  capturedAt: string;
  updatedAt: string;
  organization: ArchiveOrganization | null;
  organizations: ArchiveOrganization[];
  folders: ArchiveFolder[];
  members: ArchiveMember[];
  defaultProjectId: number | null;
  totals: ArchiveTotals;
  projects: ArchiveProjectSummary[];
}

export interface ArchiveProjectFile {
  version: number;
  capturedAt: string;
  source: string;
  project: ArchiveProject;
  organization: ArchiveOrganization | null;
  folder: ArchiveFolder | null;
  lists: HubstaffListInfo[];
  labels: HubstaffLabel[];
  members: ArchiveMember[];
  tasks: HubstaffTaskRaw[];
  taskAccess: boolean;
  error?: string | null;
}

export interface ArchiveComment {
  id: number;
  content: string;
  user_id: number;
  task_id: number;
  created_at: string;
  updated_at: string;
}

export interface ArchiveChecklistItem {
  id: number;
  name?: string;
  title?: string;
  content?: string;
  done?: boolean;
  completed?: boolean;
  position?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ArchiveChecklist {
  id: number;
  name: string;
  task_id: number;
  position?: number;
  items?: ArchiveChecklistItem[];
}

export interface ArchiveAttachment {
  id: number;
  file_name: string;
  user_id: number;
  task_id: number;
  created_at: string;
  updated_at: string;
}

export interface ArchiveTimeEntry {
  id: number;
  comments?: string;
  user_id: number;
  task_id: number;
  running?: boolean;
  seconds: number;
  stopped_at?: string | null;
  started_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchiveDeepFile {
  version: number;
  projectId: number;
  capturedAt: string;
  updatedAt: string;
  taskIds: number[];
  comments: Record<string, ArchiveComment[]>;
  checklists: Record<string, ArchiveChecklist[]>;
  attachments: Record<string, ArchiveAttachment[]>;
  timeEntries: Record<string, ArchiveTimeEntry[]>;
  checklistItemsCaptured?: Record<string, boolean>;
  errors: Record<string, string>;
}

const baseUrl = import.meta.env.BASE_URL || '/';

function archiveUrl(path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function fetchArchiveJson<T>(path: string): Promise<T> {
  const response = await fetch(archiveUrl(path), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load archive file ${path} (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

let manifestPromise: Promise<ArchiveManifest> | null = null;
const projectPromises = new Map<number, Promise<ArchiveProjectFile>>();
const deepPromises = new Map<number, Promise<ArchiveDeepFile | null>>();

export function loadArchiveManifest(force = false): Promise<ArchiveManifest> {
  if (!manifestPromise || force) {
    manifestPromise = fetchArchiveJson<ArchiveManifest>('archive/manifest.json');
  }
  return manifestPromise;
}

export function loadArchiveProject(
  projectId: number,
  manifest?: ArchiveManifest,
  force = false
): Promise<ArchiveProjectFile> {
  if (force) projectPromises.delete(projectId);
  const existing = projectPromises.get(projectId);
  if (existing) return existing;

  const summary = manifest?.projects.find((project) => project.id === projectId);
  const path = summary?.coreFile || `archive/projects/${projectId}.json`;
  const promise = fetchArchiveJson<ArchiveProjectFile>(path);
  projectPromises.set(projectId, promise);
  return promise;
}

export async function loadArchiveDeep(projectId: number): Promise<ArchiveDeepFile | null> {
  const existing = deepPromises.get(projectId);
  if (existing) return existing;

  const promise = fetchArchiveJson<ArchiveDeepFile>(`archive/deep/${projectId}.json`).catch((error) => {
    if (String(error.message).includes('HTTP 404')) return null;
    throw error;
  });
  deepPromises.set(projectId, promise);
  return promise;
}

export function isTaskRemoved(task: HubstaffTaskRaw): boolean {
  return Boolean(
    task.status === 'deleted' ||
      task.removed ||
      task.removed_at ||
      task.deleted ||
      task.deleted_at
  );
}

export function normalizeArchiveTasks(file: ArchiveProjectFile): EnrichedTaskData[] {
  const memberNameById = new Map<number, string>();
  (file.members || []).forEach((member) => {
    const name = member.name || member.email || `User #${member.id}`;
    memberNameById.set(Number(member.id), name);
  });

  const labelNameById = new Map<number, string>();
  (file.labels || []).forEach((label) => labelNameById.set(Number(label.id), label.name));

  const listById = new Map<number, HubstaffListInfo>();
  (file.lists || []).forEach((list) => listById.set(Number(list.id), list));

  const uniqueTasks = new Map<number, HubstaffTaskRaw>();
  (file.tasks || []).forEach((task) => uniqueTasks.set(Number(task.id), task));

  return Array.from(uniqueTasks.values())
    .map((task) => {
      const assigneeIds = Array.from(
        new Set(
          (task.assignee_ids || (task.assigned_to_id ? [task.assigned_to_id] : []))
            .map(Number)
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );
      const assigneeNames = assigneeIds.map((id) => memberNameById.get(id) || `User #${id}`);
      const labelIds = (task.label_ids || []).map(Number);
      const labelNames = labelIds.map((id) => labelNameById.get(id) || `Label #${id}`);
      const listInfo = task.list_id ? listById.get(Number(task.list_id)) : undefined;
      const removed = isTaskRemoved(task);
      const boardStatus =
        task.list?.name || listInfo?.name || (removed ? 'Removed task' : 'Uncategorized');

      return {
        id: Number(task.id),
        subject: task.subject || task.summary || 'Untitled Task',
        description: task.description || '',
        estimate_hours: Number(task.estimate_hours) || 0,
        position: Number(task.position) || 0,
        list_id: task.list_id ?? null,
        board_status: boardStatus,
        list_position: listInfo?.position ?? 0,
        system_status: task.status || (removed ? 'deleted' : task.done ? 'done' : 'active'),
        done: Boolean(task.done),
        assignee_ids: assigneeIds,
        assignee_names: assigneeNames,
        assignee_name: assigneeNames.join(', ') || 'Unassigned',
        label_ids: labelIds,
        label_names: labelNames,
        author_id: task.author_id ?? null,
        follower_ids: (task.follower_ids || []).map(Number),
        start_on: task.start_on ?? null,
        due_on: task.due_on ?? null,
        due_at: task.due_at ?? null,
        due_date: task.due_at || task.due_on || null,
        done_at: task.done_at ?? null,
        created_at: task.created_at,
        updated_at: task.updated_at,
        removed,
        removed_at: task.removed_at ?? task.deleted_at ?? null,
        project_id: file.project.id,
        project_name: file.project.name,
        project_folder: file.folder?.name ?? null,
      } satisfies EnrichedTaskData;
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function loadArchiveProjectTasks(
  projectId: number,
  manifest?: ArchiveManifest,
  force = false
): Promise<EnrichedTaskData[]> {
  const file = await loadArchiveProject(projectId, manifest, force);
  return normalizeArchiveTasks(file);
}

export async function loadAllArchiveTasks(manifest: ArchiveManifest): Promise<{
  tasks: EnrichedTaskData[];
  errors: Array<{ projectId: number; message: string }>;
}> {
  const accessible = manifest.projects.filter((project) => project.accessible);
  const results = await Promise.all(
    accessible.map(async (project) => {
      try {
        return { tasks: await loadArchiveProjectTasks(project.id, manifest), error: null };
      } catch (error) {
        return {
          tasks: [] as EnrichedTaskData[],
          error: { projectId: project.id, message: String((error as Error).message || error) },
        };
      }
    })
  );

  return {
    tasks: results.flatMap((result) => result.tasks),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}

export function formatHours(hours: number): string {
  return hours > 0 ? `${Math.round(hours * 10) / 10}h` : '0h';
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
