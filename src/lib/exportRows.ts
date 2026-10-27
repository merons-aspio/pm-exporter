import type { EnrichedTaskData } from '../services/hubstaff';
import { formatDate, isTaskOverdue } from './dates';
import { BUCKET_META, getEffectiveBucket } from './status';
import type { StatusMapping, StatusOverrides } from './status';

export function buildExportRows(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides
): Record<string, unknown>[] {
  return tasks.map((task) => {
    const bucket = getEffectiveBucket(task, mapping, overrides);

    return {
      ID: task.id,
      Title: task.subject,
      'Board Status': task.board_status,
      Status: BUCKET_META[bucket].label,
      'System Status': task.system_status,
      Assignees: task.assignee_names.join('; ') || 'Unassigned',
      Labels: task.label_names.join('; '),
      'Estimate Hours': task.estimate_hours,
      'Due Date': task.due_date ? formatDate(task.due_date) : '',
      'Start Date': task.start_on ? formatDate(task.start_on) : '',
      'Created At': formatDate(task.created_at),
      'Updated At': formatDate(task.updated_at),
      'Done At': task.done_at ? formatDate(task.done_at) : '',
      Overdue: bucket !== 'done' && isTaskOverdue(task.due_date, task.done) ? 'yes' : 'no',
      Description: task.description,
    };
  });
}
