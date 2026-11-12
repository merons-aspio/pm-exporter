#!/usr/bin/env node
/**
 * One-time Hubstaff Tasks archive exporter.
 *
 * Usage:
 *   node scripts/export-hubstaff-archive.mjs --core
 *   node scripts/export-hubstaff-archive.mjs --deep
 *   node scripts/export-hubstaff-archive.mjs --all
 *   node scripts/export-hubstaff-archive.mjs --deep --project 1110971
 *
 * Reads Hubstaff OAuth credentials from .env.local (gitignored), refreshes the
 * access token when needed, and writes static JSON files to public/archive/.
 * The script never writes credentials into the archive.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const SESSION_PATH = path.join(ROOT, '.hubstaff_session.json');
const ARCHIVE_DIR = path.join(ROOT, 'public', 'archive');
const PROJECT_DIR = path.join(ARCHIVE_DIR, 'projects');
const DEEP_DIR = path.join(ARCHIVE_DIR, 'deep');
const MANIFEST_PATH = path.join(ARCHIVE_DIR, 'manifest.json');
const TASKS_BASE = 'https://tasks.hubstaff.com/api/v1';
const AUTH_BASE = 'https://account.hubstaff.com';
const MIN_REQUEST_INTERVAL_MS = Number(process.env.ARCHIVE_REQUEST_INTERVAL_MS) || 2500; // ~95 req/min sequential, below the 120/min limit
const DEEP_SAVE_EVERY = 20;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

if (!hasFlag('--core') && !hasFlag('--deep')) {
  console.log('Usage: node scripts/export-hubstaff-archive.mjs --core | --deep | --all [--project <id>]');
  process.exit(0);
}

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.mkdirSync(DEEP_DIR, { recursive: true });

function parseEnv(source) {
  const map = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    map[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return map;
}

const env = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
const clientId = env.HUBSTAFF_CLIENT_ID;
const clientSecret = env.HUBSTAFF_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing HUBSTAFF_CLIENT_ID / HUBSTAFF_CLIENT_SECRET in .env.local');
  process.exit(1);
}

let accessToken = env.VITE_HUBSTAFF_TOKEN || '';
let refreshToken = env.VITE_HUBSTAFF_REFRESH_TOKEN || '';
if (fs.existsSync(SESSION_PATH)) {
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    if (session.refresh_token) refreshToken = session.refresh_token;
    if (session.access_token) accessToken = session.access_token;
  } catch {
    /* ignore malformed session file */
  }
}

function persistTokens(nextAccess, nextRefresh) {
  if (!fs.existsSync(ENV_PATH)) return;
  let text = fs.readFileSync(ENV_PATH, 'utf8');
  const setLine = (key, value) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    text = regex.test(text) ? text.replace(regex, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
  };
  if (nextAccess) setLine('VITE_HUBSTAFF_TOKEN', nextAccess);
  if (nextRefresh) setLine('VITE_HUBSTAFF_REFRESH_TOKEN', nextRefresh);
  fs.writeFileSync(ENV_PATH, text, 'utf8');
  fs.writeFileSync(
    SESSION_PATH,
    JSON.stringify(
      {
        access_token: nextAccess || accessToken,
        refresh_token: nextRefresh || refreshToken,
        updated_at: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

let refreshPromise = null;
async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (!refreshToken) throw new Error('No refresh token available');
    const response = await fetch(`${AUTH_BASE}/access_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Token refresh failed ${response.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    if (!data.access_token) throw new Error('Token refresh response had no access token');
    accessToken = data.access_token;
    refreshToken = data.refresh_token || refreshToken;
    persistTokens(accessToken, refreshToken);
    console.log('Refreshed access token and persisted rotated tokens.');
    return accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

let nextRequestAt = 0;
let pauseUntil = 0;
let loggedRateLimit = false;
async function waitForRateSlot() {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt, pauseUntil);
  const wait = Math.max(0, startAt - now);
  nextRequestAt = startAt + MIN_REQUEST_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(pathname, { attempts = 5 } = {}) {
  const url = pathname.startsWith('http') ? pathname : `${TASKS_BASE}${pathname}`;
  let lastError = null;
  let failures = 0;
  let rateLimitWaits = 0;

  while (failures < attempts) {
    await waitForRateSlot();
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(45000),
      });
    } catch (error) {
      failures += 1;
      lastError = error;
      await sleep(1000 * failures);
      continue;
    }

    // Proactively pause before the window runs dry instead of triggering a
    // long 429 cooldown.
    const remaining = Number(response.headers.get('x-rate-limit-remaining'));
    const reset = Number(response.headers.get('x-rate-limit-reset'));
    const limit = response.headers.get('x-rate-limit-limit');
    if (!loggedRateLimit && response.ok) {
      loggedRateLimit = true;
      const resetAt = Number.isFinite(reset) && reset > 0 ? (reset > 1e12 ? reset : reset * 1000) : null;
      console.log(
        `Rate limit: ${Number.isFinite(remaining) ? remaining : '?'} of ${limit ?? '?'} remaining` +
          (resetAt ? `, window resets at ${new Date(resetAt).toISOString()}` : '')
      );
    }
    if (Number.isFinite(remaining) && remaining <= 10 && Number.isFinite(reset) && reset > 0) {
      const resetAt = reset > 1e12 ? reset : reset * 1000;
      if (resetAt > Date.now()) pauseUntil = Math.max(pauseUntil, resetAt + 500);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + 1000 : 60000;
      rateLimitWaits += 1;
      lastError = new Error(`429 rate_limit (waited ${Math.ceil(waitMs / 1000)}s)`);
      if (rateLimitWaits > 10) throw lastError;
      pauseUntil = Math.max(pauseUntil, Date.now() + waitMs);
      console.warn(
        `Rate limited; pausing ${Math.ceil(waitMs / 1000)}s (retry ${rateLimitWaits}/10)…`
      );
      continue;
    }

    if (response.status === 401 && failures < attempts - 1) {
      try {
        await refreshAccessToken();
      } catch (error) {
        throw new Error(`Unauthorized and token refresh failed: ${error.message}`);
      }
      failures += 1;
      continue;
    }

    if (response.status >= 500) {
      failures += 1;
      const text = await response.text().catch(() => '');
      lastError = new Error(`${response.status} ${text.slice(0, 300)}`);
      if (failures < attempts) await sleep(Math.min(30000, 1500 * failures * failures));
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${response.status} ${text.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Response was not JSON for ${url}`);
    }
  }

  throw lastError || new Error(`Request failed for ${url}`);
}

async function allPages(pathname, key, pageLimit = 500) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const separator = pathname.includes('?') ? '&' : '?';
    const url = `${pathname}${separator}page_limit=${pageLimit}${cursor ? `&page_start_id=${cursor}` : ''}`;
    const data = await requestJson(url);
    items.push(...(data[key] || []));
    const next = data.pagination?.next_page_start_id;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return items;
}

function writeJson(filePath, data, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function isRemoved(task) {
  return Boolean(
    task?.removed ||
      task?.removed_at ||
      task?.deleted ||
      task?.deleted_at ||
      task?.status === 'deleted'
  );
}

function projectFileName(projectId) {
  return `${projectId}.json`;
}

function relFile(folder, projectId) {
  return `archive/${folder}/${projectFileName(projectId)}`;
}

function summarizeProject(project, folder, tasks, lists, labels, error = null) {
  const activeTasks = tasks.filter((task) => !isRemoved(task));
  const removedTasks = tasks.filter(isRemoved);
  const estimate = (items) =>
    items.reduce((total, task) => total + (Number(task.estimate_hours) || 0), 0);

  return {
    id: project.id,
    name: project.name,
    archived: Boolean(project.archived),
    organizationId: project.organization_id,
    folderId: project.folder_id ?? null,
    folderName: folder?.name ?? null,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    accessible: !error,
    error,
    coreFile: relFile('projects', project.id),
    deepFile: relFile('deep', project.id),
    taskCount: tasks.length,
    activeTaskCount: activeTasks.length,
    removedTaskCount: removedTasks.length,
    listCount: lists.length,
    labelCount: labels.length,
    estimatedHours: estimate(tasks),
    activeEstimatedHours: estimate(activeTasks),
    deepStatus: 'pending',
    deepCounts: {
      comments: 0,
      checklists: 0,
      checklistItems: 0,
      attachments: 0,
      timeEntries: 0,
      timeSeconds: 0,
      capturedTasks: 0,
    },
    deepUpdatedAt: null,
  };
}

function emptyManifest() {
  return {
    version: 1,
    source: 'Hubstaff Tasks API v1',
    capturedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organization: null,
    organizations: [],
    folders: [],
    members: [],
    defaultProjectId: null,
    totals: {
      projects: 0,
      accessibleProjects: 0,
      inaccessibleProjects: 0,
      tasks: 0,
      activeTasks: 0,
      removedTasks: 0,
      lists: 0,
      labels: 0,
      members: 0,
      estimatedHours: 0,
      comments: 0,
      checklists: 0,
      checklistItems: 0,
      attachments: 0,
      timeEntries: 0,
      timeSeconds: 0,
    },
    projects: [],
  };
}

function loadManifest() {
  return readJson(MANIFEST_PATH, null) || emptyManifest();
}

function recomputeManifestTotals(manifest) {
  const projects = manifest.projects || [];
  const sum = (fn) => projects.reduce((total, project) => total + (Number(fn(project)) || 0), 0);
  const deepSum = (key) => sum((project) => project.deepCounts?.[key]);

  manifest.totals = {
    projects: projects.length,
    accessibleProjects: projects.filter((project) => project.accessible).length,
    inaccessibleProjects: projects.filter((project) => !project.accessible).length,
    tasks: sum((project) => project.taskCount),
    activeTasks: sum((project) => project.activeTaskCount),
    removedTasks: sum((project) => project.removedTaskCount),
    lists: sum((project) => project.listCount),
    labels: sum((project) => project.labelCount),
    members: (manifest.members || []).length,
    estimatedHours: sum((project) => project.estimatedHours),
    comments: deepSum('comments'),
    checklists: deepSum('checklists'),
    checklistItems: deepSum('checklistItems'),
    attachments: deepSum('attachments'),
    timeEntries: deepSum('timeEntries'),
    timeSeconds: deepSum('timeSeconds'),
  };
  manifest.updatedAt = new Date().toISOString();
  return manifest;
}

function saveManifest(manifest) {
  recomputeManifestTotals(manifest);
  writeJson(MANIFEST_PATH, manifest, true);
}

async function exportCore() {
  console.log('Starting core archive export…');
  const manifest = loadManifest();
  const capturedAt = manifest.capturedAt || new Date().toISOString();
  manifest.capturedAt = capturedAt;

  const organizations = await allPages('/organizations', 'organizations', 100);
  manifest.organizations = organizations;
  manifest.organization = organizations[0] || null;
  if (!organizations.length) throw new Error('No Hubstaff organizations returned');

  const orgId = organizations[0].id;
  const folders = await allPages(`/organizations/${orgId}/folders`, 'folders', 100);
  const members = await allPages(`/organizations/${orgId}/members`, 'members', 500);
  const projects = await allPages(`/organizations/${orgId}/projects`, 'projects', 100);

  manifest.folders = folders;
  manifest.members = members;

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const byId = new Map(manifest.projects.map((entry) => [entry.id, entry]));
  const onlyProject = getArg('--project') ? Number(getArg('--project')) : null;

  let index = 0;
  for (const project of projects) {
    index += 1;
    if (onlyProject && project.id !== onlyProject) continue;

    const folder = project.folder_id ? folderById.get(project.folder_id) : null;
    let lists = [];
    let labels = [];
    let tasks = [];
    let error = null;

    try {
      [lists, labels] = await Promise.all([
        allPages(`/projects/${project.id}/lists`, 'lists', 500),
        allPages(`/projects/${project.id}/labels`, 'labels', 500),
      ]);
    } catch (caught) {
      error = caught.status === 403 ? 'no_access' : String(caught.message || caught).slice(0, 500);
    }

    if (!error) {
      try {
        tasks = await allPages(`/projects/${project.id}/tasks?removed=true&include%5B%5D=users`, 'tasks', 500);
      } catch (caught) {
        error = caught.status === 403 ? 'no_access' : String(caught.message || caught).slice(0, 500);
      }
    }

    const core = {
      version: 1,
      capturedAt,
      source: 'Hubstaff Tasks API v1',
      project,
      organization: organizations[0],
      folder,
      lists,
      labels,
      members,
      tasks,
      taskAccess: !error,
      error,
    };
    writeJson(path.join(PROJECT_DIR, projectFileName(project.id)), core);

    const entry = summarizeProject(project, folder, tasks, lists, labels, error);
    const previous = byId.get(project.id);
    if (previous?.deepStatus && previous.deepStatus !== 'pending') {
      entry.deepStatus = previous.deepStatus;
      entry.deepCounts = previous.deepCounts;
      entry.deepUpdatedAt = previous.deepUpdatedAt;
    }
    byId.set(project.id, entry);
    manifest.projects = Array.from(byId.values()).sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));
    manifest.defaultProjectId =
      manifest.projects.find((candidate) => candidate.id === 1110971 && candidate.accessible)?.id ||
      manifest.projects.find((candidate) => candidate.accessible)?.id ||
      null;
    saveManifest(manifest);

    console.log(
      `[core ${index}/${projects.length}] ${project.id} ${project.name}: ` +
        `${tasks.length} tasks (${entry.removedTaskCount} removed), ${lists.length} lists, ${labels.length} labels` +
        (error ? ` — ${error}` : '')
    );
  }

  saveManifest(manifest);
  console.log(
    `Core export complete: ${manifest.projects.length} projects, ` +
      `${manifest.totals.tasks} tasks, ${manifest.totals.removedTasks} removed, ` +
      `${manifest.totals.accessibleProjects} accessible.`
  );
}

function deepCounts(deep) {
  const countMap = (map) => Object.values(map || {}).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
  const checklists = deep.checklists || {};
  const checklistCount = Object.values(checklists).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
  const checklistItems = Object.values(checklists).reduce(
    (total, list) =>
      total + (Array.isArray(list) ? list.reduce((inner, checklist) => inner + (checklist.items?.length || 0), 0) : 0),
    0
  );
  const timeEntries = deep.timeEntries || {};
  const timeSeconds = Object.values(timeEntries).reduce(
    (total, list) => total + (Array.isArray(list) ? list.reduce((inner, entry) => inner + (Number(entry.seconds) || 0), 0) : 0),
    0
  );

  return {
    comments: countMap(deep.comments),
    checklists: checklistCount,
    checklistItems,
    attachments: countMap(deep.attachments),
    timeEntries: countMap(deep.timeEntries),
    timeSeconds,
    capturedTasks: (deep.taskIds || []).length,
  };
}

function refreshManifestDeepEntry(manifest, projectId, deep, status) {
  const entry = (manifest.projects || []).find((project) => project.id === projectId);
  if (!entry) return;
  entry.deepStatus = status;
  entry.deepCounts = deepCounts(deep);
  entry.deepUpdatedAt = deep.updatedAt || new Date().toISOString();
  saveManifest(manifest);
}

async function exportDeep() {
  const manifest = loadManifest();
  if (!manifest.projects?.length) throw new Error('Run the core export first');

  const onlyProject = getArg('--project') ? Number(getArg('--project')) : null;
  const retryErrors = hasFlag('--retry-errors');
  // Sort projects by their most recent task's created_at descending (newest first).
  // Read each core file to find the most recent task date.
  const projects = manifest.projects
    .filter((project) => project.accessible && (!onlyProject || project.id === onlyProject))
    .sort((a, b) => {
      const aRecent = readJson(path.join(PROJECT_DIR, projectFileName(a.id)), null)?.tasks?.reduce(
        (max, t) => Math.max(max, new Date(t.created_at).valueOf() || 0),
        0
      ) || 0;
      const bRecent = readJson(path.join(PROJECT_DIR, projectFileName(b.id)), null)?.tasks?.reduce(
        (max, t) => Math.max(max, new Date(t.created_at).valueOf() || 0),
        0
      ) || 0;
      return bRecent - aRecent;
    });

  console.log(`Starting deep archive export for ${projects.length} projects…`);

  for (const entry of projects) {
    const corePath = path.join(PROJECT_DIR, projectFileName(entry.id));
    const core = readJson(corePath, null);
    if (!core) {
      console.warn(`Skipping ${entry.id}: missing core file`);
      continue;
    }

    const deepPath = path.join(DEEP_DIR, projectFileName(entry.id));
    const deep = readJson(deepPath, null) || {
      version: 1,
      projectId: entry.id,
      capturedAt: core.capturedAt,
      updatedAt: new Date().toISOString(),
      taskIds: [],
      comments: {},
      checklists: {},
      attachments: {},
      timeEntries: {},
      checklistItemsCaptured: {},
      errors: {},
    };
    deep.comments ||= {};
    deep.checklists ||= {};
    deep.attachments ||= {};
    deep.timeEntries ||= {};
    deep.checklistItemsCaptured ||= {};
    deep.errors ||= {};
    deep.taskIds ||= [];

    if (retryErrors) {
      for (const taskId of Object.keys(deep.errors)) {
        const index = deep.taskIds.indexOf(Number(taskId));
        if (index >= 0) deep.taskIds.splice(index, 1);
      }
      deep.errors = {};
    }

    const processed = new Set(deep.taskIds.map(Number));
    // Sort pending tasks by created_at descending (newest first) to prioritize recent months
    const pending = (core.tasks || [])
      .filter((task) => !processed.has(Number(task.id)))
      .sort((a, b) => new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf());
    console.log(
      `[deep] ${entry.id} ${entry.name}: ${processed.size} already captured, ${pending.length} remaining`
    );

    // Older exports captured checklists but not their items because the API
    // returns `checklist_items` rather than `items`. Backfill once per checklist.
    const existingChecklists = Object.values(deep.checklists).flat();
    const missingChecklistItems = existingChecklists.filter(
      (checklist) => !deep.checklistItemsCaptured[String(checklist.id)]
    );
    for (const checklist of missingChecklistItems) {
      try {
        checklist.items = await allPages(`/checklists/${checklist.id}/items`, 'checklist_items', 500);
        deep.checklistItemsCaptured[String(checklist.id)] = true;
      } catch (error) {
        if (error.status !== 404 && error.status !== 403) {
          deep.errors[String(checklist.task_id)] = `${deep.errors[String(checklist.task_id)] || ''}checklist ${checklist.id}: ${String(error.message || error).slice(0, 180)}`.trim();
        }
        checklist.items ||= [];
      }
    }
    if (missingChecklistItems.length > 0) {
      deep.updatedAt = new Date().toISOString();
      writeJson(deepPath, deep);
      refreshManifestDeepEntry(manifest, entry.id, deep, 'partial');
      console.log(`[deep] ${entry.id} backfilled ${missingChecklistItems.length} checklists`);
    }

    let completedThisRun = 0;
    for (const task of pending) {
      const taskId = Number(task.id);
      const errors = [];

      const capture = async (endpoint, key, target) => {
        try {
          const items = await allPages(`/tasks/${taskId}/${endpoint}`, key, 500);
          if (items.length > 0) target[String(taskId)] = items;
        } catch (error) {
          if (error.status !== 404 && error.status !== 403) {
            errors.push(`${endpoint}: ${String(error.message || error).slice(0, 180)}`);
          }
        }
      };

      // Capture deep fields one endpoint at a time to avoid request bursts that
      // trigger Hubstaff's rate limit (120 requests/minute per token).
      await capture('comments', 'comments', deep.comments);
      await capture('checklists', 'checklists', deep.checklists);
      await capture('attachments', 'attachments', deep.attachments);
      await capture('time_entries', 'time_entries', deep.timeEntries);

      const taskChecklists = deep.checklists[String(taskId)] || [];
      if (taskChecklists.length > 0) {
        for (const checklist of taskChecklists) {
          if (deep.checklistItemsCaptured?.[String(checklist.id)]) continue;
          try {
            checklist.items = await allPages(`/checklists/${checklist.id}/items`, 'checklist_items', 500);
            deep.checklistItemsCaptured ||= {};
            deep.checklistItemsCaptured[String(checklist.id)] = true;
          } catch (error) {
            if (error.status !== 404 && error.status !== 403) {
              errors.push(`checklist ${checklist.id}: ${String(error.message || error).slice(0, 180)}`);
            }
            checklist.items ||= [];
          }
        }
      }

      deep.taskIds.push(taskId);
      if (errors.length > 0) deep.errors[String(taskId)] = errors.join('; ');
      else delete deep.errors[String(taskId)];

      completedThisRun += 1;
      deep.updatedAt = new Date().toISOString();

      if (completedThisRun % DEEP_SAVE_EVERY === 0) {
        writeJson(deepPath, deep);
        refreshManifestDeepEntry(manifest, entry.id, deep, 'partial');
        console.log(
          `[deep ${entry.id}] ${processed.size + completedThisRun}/${core.tasks.length} tasks captured`
        );
      }
    }

    writeJson(deepPath, deep);
    refreshManifestDeepEntry(manifest, entry.id, deep, pending.length === 0 ? 'complete' : 'partial');
    console.log(
      `[deep] ${entry.id} ${entry.name} complete: ${deep.taskIds.length}/${core.tasks.length} tasks, ` +
        `${deepCounts(deep).comments} comments, ${deepCounts(deep).attachments} attachments, ` +
        `${deepCounts(deep).timeEntries} time entries, ${Object.keys(deep.errors).length} errors`
    );
  }

  saveManifest(manifest);
  console.log('Deep export complete.');
}

try {
  if (hasFlag('--core') || hasFlag('--all')) await exportCore();
  if (hasFlag('--deep') || hasFlag('--all')) await exportDeep();
} catch (error) {
  console.error(`Archive export failed: ${error.message || error}`);
  process.exit(1);
}
