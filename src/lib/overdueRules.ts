/**
 * Overdue Rules Configuration
 * User-configurable rules for what counts as overdue
 */
export interface OverdueRule {
  status: string;           // board status to check
  daysThreshold?: number;   // how many days past due (0 = any past due)
  enabled: boolean;
}

export const DEFAULT_OVERDUE_RULES: OverdueRule[] = [
  { status: 'todo', enabled: true, daysThreshold: 0 },
  { status: 'blocked', enabled: true, daysThreshold: 0 },
  { status: 'inprogress', enabled: true, daysThreshold: 0 },
];

export function isOverdueTask(task: any, rules: OverdueRule[]): boolean {
  const status = (task.system_status || '').toLowerCase();
  const rule = rules.find((r) => r.status.toLowerCase() === status);
  if (!rule || !rule.enabled) return false;

  const dueDate = task.due_on ? new Date(task.due_on) : null;
  if (!dueDate || isNaN(dueDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If threshold is 0, any past due counts
  if (rule.daysThreshold === 0 || rule.daysThreshold === undefined) {
    return dueDate < today;
  }

  const thresholdDate = new Date(today);
  thresholdDate.setDate(thresholdDate.getDate() - (rule.daysThreshold || 0));
  return dueDate < thresholdDate;
}
