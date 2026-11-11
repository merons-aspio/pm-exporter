#!/usr/bin/env node
/**
 * Verify the static archive in public/archive.
 *
 * Usage:
 *   node scripts/verify-archive.mjs
 *
 * Checks manifest totals against the per-project core/deep files, verifies that
 * deep task IDs exist in the core files, and scans the archive for leaked
 * credentials from .env.local. Exits non-zero when an issue is found.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARCHIVE_DIR = path.join(ROOT, 'public', 'archive');
const PROJECT_DIR = path.join(ARCHIVE_DIR, 'projects');
const DEEP_DIR = path.join(ARCHIVE_DIR, 'deep');
const MANIFEST_PATH = path.join(ARCHIVE_DIR, 'manifest.json');
const ENV_PATH = path.join(ROOT, '.env.local');

const issues = [];
const notes = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    issues.push(`Could not read ${path.relative(ROOT, filePath)}: ${error.message}`);
    return null;
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

function countMap(map) {
  return Object.values(map || {}).reduce(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0
  );
}

function deepCounts(deep) {
  const checklists = deep.checklists || {};
  const checklistCount = Object.values(checklists).reduce(
    (total, list) => total + (Array.isArray(list) ? list.length : 0),
    0
  );
  const checklistItems = Object.values(checklists).reduce(
    (total, list) =>
      total +
      (Array.isArray(list)
        ? list.reduce((inner, checklist) => inner + (checklist.items?.length || 0), 0)
        : 0),
    0
  );
  const timeEntries = deep.timeEntries || {};
  const timeSeconds = Object.values(timeEntries).reduce(
    (total, list) =>
      total +
      (Array.isArray(list) ? list.reduce((inner, entry) => inner + (Number(entry.seconds) || 0), 0) : 0),
    0
  );

  return {
    comments: countMap(deep.comments),
    checklists: checklistCount,
    checklistItems,
    attachments: countMap(deep.attachments),
    timeEntries: countMap(timeEntries),
    timeSeconds,
    capturedTasks: (deep.taskIds || []).length,
  };
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('Missing public/archive/manifest.json. Run the core exporter first.');
  process.exit(1);
}

const manifest = readJson(MANIFEST_PATH);
if (!manifest) process.exit(1);

const sums = {
  projects: 0,
  accessibleProjects: 0,
  inaccessibleProjects: 0,
  tasks: 0,
  activeTasks: 0,
  removedTasks: 0,
  lists: 0,
  labels: 0,
  estimatedHours: 0,
  comments: 0,
  checklists: 0,
  checklistItems: 0,
  attachments: 0,
  timeEntries: 0,
  timeSeconds: 0,
  capturedTasks: 0,
};

for (const summary of manifest.projects || []) {
  sums.projects += 1;
  if (summary.accessible) sums.accessibleProjects += 1;
  else sums.inaccessibleProjects += 1;
  sums.tasks += summary.taskCount || 0;
  sums.activeTasks += summary.activeTaskCount || 0;
  sums.removedTasks += summary.removedTaskCount || 0;
  sums.lists += summary.listCount || 0;
  sums.labels += summary.labelCount || 0;
  sums.estimatedHours += summary.estimatedHours || 0;

  const corePath = path.join(PROJECT_DIR, `${summary.id}.json`);
  if (!fs.existsSync(corePath)) {
    issues.push(`#${summary.id}: missing core file ${path.relative(ROOT, corePath)}`);
    continue;
  }

  const core = readJson(corePath);
  if (!core) continue;
  const tasks = core.tasks || [];
  const active = tasks.filter((task) => !isRemoved(task)).length;
  const removed = tasks.filter(isRemoved).length;

  if (!summary.accessible) {
    if (tasks.length > 0) issues.push(`#${summary.id}: inaccessible project contains tasks`);
    if (!summary.error) issues.push(`#${summary.id}: inaccessible project has no error note`);
    continue;
  }

  if (tasks.length !== summary.taskCount) {
    issues.push(`#${summary.id}: core tasks ${tasks.length} != manifest ${summary.taskCount}`);
  }
  if (active !== summary.activeTaskCount) {
    issues.push(`#${summary.id}: core active ${active} != manifest ${summary.activeTaskCount}`);
  }
  if (removed !== summary.removedTaskCount) {
    issues.push(`#${summary.id}: core removed ${removed} != manifest ${summary.removedTaskCount}`);
  }
  if (active + removed !== summary.taskCount) {
    issues.push(`#${summary.id}: active + removed != total`);
  }

  const deepPath = path.join(DEEP_DIR, `${summary.id}.json`);
  if (!fs.existsSync(deepPath)) {
    if (summary.deepStatus !== 'pending') {
      issues.push(`#${summary.id}: deep status ${summary.deepStatus} but no deep file`);
    }
    continue;
  }

  const deep = readJson(deepPath);
  if (!deep) continue;
  const counts = deepCounts(deep);
  const expected = summary.deepCounts || {};
  for (const key of Object.keys(counts)) {
    if (counts[key] !== expected[key]) {
      issues.push(`#${summary.id}: deep ${key} ${counts[key]} != manifest ${expected[key]}`);
    }
    sums[key] += counts[key];
  }

  if (summary.deepStatus === 'complete' && counts.capturedTasks !== tasks.length) {
    issues.push(`#${summary.id}: deep complete but captured ${counts.capturedTasks}/${tasks.length}`);
  }

  const taskIds = new Set(tasks.map((task) => Number(task.id)));
  for (const taskId of deep.taskIds || []) {
    if (!taskIds.has(Number(taskId))) {
      issues.push(`#${summary.id}: deep task #${taskId} is not in the core file`);
    }
  }
}

for (const [key, value] of Object.entries(sums)) {
  if (key === 'capturedTasks') continue;
  const actual = manifest.totals?.[key];
  if (key === 'estimatedHours') {
    if (Math.abs((actual || 0) - value) > 0.01) {
      issues.push(`totals.${key} ${actual} != computed ${value}`);
    }
  } else if (actual !== value) {
    issues.push(`totals.${key} ${actual} != computed ${value}`);
  }
}

if ((manifest.members || []).length !== manifest.totals?.members) {
  issues.push(`totals.members ${manifest.totals?.members} != ${(manifest.members || []).length}`);
}

// Make sure no credential from .env.local ended up in a static archive file.
if (fs.existsSync(ENV_PATH)) {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  const secrets = [
    env.HUBSTAFF_CLIENT_SECRET,
    env.APP_SECRET_PASSPHRASE,
    env.VITE_HUBSTAFF_TOKEN,
    env.VITE_HUBSTAFF_REFRESH_TOKEN,
  ].filter((value) => value && value.length >= 8);

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  walk(ARCHIVE_DIR);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const secret of secrets) {
      if (text.includes(secret)) issues.push(`credential found in ${path.relative(ROOT, file)}`);
    }
  }
  notes.push(`scanned ${files.length} archive files for credentials`);
}

console.log(
  JSON.stringify(
    {
      projects: sums.projects,
      accessible: sums.accessibleProjects,
      inaccessible: sums.inaccessibleProjects,
      tasks: sums.tasks,
      active: sums.activeTasks,
      removed: sums.removedTasks,
      deep: {
        capturedTasks: sums.capturedTasks,
        comments: sums.comments,
        checklists: sums.checklists,
        checklistItems: sums.checklistItems,
        attachments: sums.attachments,
        timeEntries: sums.timeEntries,
      },
      notes,
      issues,
    },
    null,
    2
  )
);

process.exit(issues.length > 0 ? 1 : 0);
