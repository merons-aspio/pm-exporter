import type { EnrichedTaskData } from '../services/hubstaff';
import { endOfDayMs, isInRange, startOfDayMs } from './dates';

export interface ActivityCounts {
  created: number;
  completed: number;
  touched: number;
}

export interface AssigneeActivity extends ActivityCounts {
  name: string;
}

export function computeActivity(tasks: EnrichedTaskData[], startKey: string, endKey: string): ActivityCounts {
  const start = startOfDayMs(startKey);
  const end = endOfDayMs(endKey);
  const counts: ActivityCounts = { created: 0, completed: 0, touched: 0 };

  tasks.forEach((task) => {
    if (isInRange(task.created_at, start, end)) counts.created += 1;
    if (isInRange(task.done_at, start, end)) counts.completed += 1;
    if (isInRange(task.updated_at, start, end)) counts.touched += 1;
  });

  return counts;
}

export function computeActivityByAssignee(
  tasks: EnrichedTaskData[],
  startKey: string,
  endKey: string
): AssigneeActivity[] {
  const start = startOfDayMs(startKey);
  const end = endOfDayMs(endKey);
  const byAssignee = new Map<string, ActivityCounts>();

  tasks.forEach((task) => {
    const created = isInRange(task.created_at, start, end);
    const completed = isInRange(task.done_at, start, end);
    const touched = isInRange(task.updated_at, start, end);
    if (!created && !completed && !touched) return;

    const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
    names.forEach((name) => {
      const counts = byAssignee.get(name) ?? { created: 0, completed: 0, touched: 0 };
      if (created) counts.created += 1;
      if (completed) counts.completed += 1;
      if (touched) counts.touched += 1;
      byAssignee.set(name, counts);
    });
  });

  return Array.from(byAssignee.entries())
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.created + b.completed + b.touched - (a.created + a.completed + a.touched));
}
