import * as sendgrid from '@sendgrid/mail';

// Set from env or default
const SENDGRID_API_KEY = import.meta.env.VITE_SENDGRID_API_KEY || '';
sendgrid.setApiKey(SENDGRID_API_KEY);

export interface ReportData {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  liveTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  todoTasks: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number[]>;
  recentActivities: Array<{ taskId: number; subject: string; status: string; dueDate: string; assignee: string }>;
  generatedAt: string;
}

/**
 * Generate a styled HTML report from task data
 */
export function generateHtmlReport(data: ReportData): string {
  const statusColors: Record<string, string> = {
    live: '#10b981',
    inprogress: '#f59e0b',
    blocked: '#ef4444',
    todo: '#6b7280',
    done: '#84cc16',
  };

  const statusLabels: Record<string, string> = {
    live: 'Live',
    inprogress: 'In Progress',
    blocked: 'Blocked',
    todo: 'To Do',
    done: 'Done',
  };

  const getStatusColor = (status: string) => statusColors[status] || '#6b7280';

  // Sort tasks by due date for overdue highlighting
  const sortedActivities = [...data.recentActivities].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hubstaff PM Exporter - Daily Report</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f4;">
    
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f4f4; padding: 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px; margin: 0 auto;">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #0f766e, #0891b2); color: #ffffff; padding: 30px 20px;">
                <h1 style="margin: 0; font-size: 24px;">Hubstaff PM Exporter</h1>
                <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Daily Task Report</p>
              </td>
            </tr>
            
            <!-- Summary Section -->
            <tr>
              <td style="padding: 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <!-- Left: Key Metrics -->
                    <td width="50%" style="padding: 10px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Total Tasks</td>
                          <td style="font-size: 24px; font-weight: bold; color: #0f172a;">${data.totalTasks}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Completed</td>
                          <td style="font-size: 24px; font-weight: bold; color: #10b981;">${data.completedTasks}</td>
                        </tr>
                        <tr>
                          <td style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Overdue</td>
                          <td style="font-size: 24px; font-weight: bold; color: #ef4444;">${data.overdueTasks}</td>
                        </tr>
                      </table>
                    </td>
                    
                    <!-- Right: Status Breakdown -->
                    <td width="50%" style="padding: 10px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        ${Object.entries(data.byStatus).map(([status, count]) => `
                          <tr>
                            <td style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">${statusLabels[status] || status}</td>
                            <td style="font-size: 20px; color: ${getStatusColor(status)}; font-weight: bold;">${count}</td>
                          </tr>
                        `).join('')}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </table>
            
            <!-- Status Breakdown Details -->
            <tr>
              <td style="padding: 20px; border-top: 1px solid #e2e8f0;">
                <h2 style="margin: 0 0 15px; font-size: 16px; color: #0f172a;">Status Breakdown</h2>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${Object.entries(data.byStatus).map(([status, count]) => `
                    <tr>
                      <td style="padding: 8px 0; color: ${getStatusColor(status)}; font-weight: bold;">${statusLabels[status] || status}</td>
                      <td style="padding: 8px 0; text-align: right;">${count} tasks</td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
            
            <!-- Overdue Alerts -->
            ${data.overdueTasks > 0 ? `
            <tr>
              <td style="padding: 20px; background: #fef2f2; border-top: 1px solid #fecaca;">
                <h2 style="margin: 0 0 10px; font-size: 16px; color: #b91c1c;">⚠️ Overdue Alert</h2>
                <p style="margin: 0 0 10px; color: #7f1d1d; font-size: 14px;">${data.overdueTasks} task(s) are currently To Do but past their due date:</p>
                <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
                  ${sortedActivities
                    .slice(0, 5)
                    .map((item) => `<li style="margin: 4px 0;">#${item.taskId}: ${item.subject} (Due: ${new Date(item.dueDate).toLocaleDateString()}) - Assignee: ${item.assignee}</li>`)
                    .join('')}
                </ul>
                ${sortedActivities.length > 5 ? `<p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;">... and ${sortedActivities.length - 5} more` : ''}
              </td>
            </tr>
            ` : ''}
            
            <!-- Recent Activities -->
            ${data.recentActivities.length > 0 ? `
            <tr>
              <td style="padding: 20px; border-top: 1px solid #e2e8f0;">
                <h2 style="margin: 0 0 15px; font-size: 16px; color: #0f172a;">Recent Activity</h2>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${data.recentActivities
                    .slice(0, 10)
                    .map((item) => `
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #374151;">
                        <strong>#${item.taskId}</strong> ${item.subject} - <span style="color: ${getStatusColor(item.status)};">${statusLabels[item.status] || item.status}</span>
                      </td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
            ` : ''}
            
            <!-- Footer -->
            <tr>
              <td style="background: #f1f5f9; padding: 15px 20px; font-size: 12px; color: #64748b; text-align: center;">
                <p style="margin: 0;">Generated ${new Date(data.generatedAt).toLocaleString()} | Hubstaff PM Exporter</p>
                <p style="margin: 5px 0 0; font-size: 10px; color: #98a2a9;">If you received this in error, please ignore this email.</p>
              </td>
            </tr>
            
          </table>
        </td>
      </tr>
    </table>
    
  </body>
  </html>
  `;
}

/**
 * Send email report via SendGrid
 */
export async function sendEmailReport(
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!SENDGRID_API_KEY) {
      return { success: false, error: 'SendGrid API key not configured' };
    }

    await sendgrid.send({
      from: {
        email: 'meron.s@aspio.se', // Will be overridden or use default
        name: 'Hubstaff PM Exporter',
      },
      to: emailToArray(to),
      subject,
      html: htmlBody,
    });

    return { success: true };
  } catch (error: any) {
    console.error('SendGrid error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send email via SendGrid' 
    };
  }
}

/**
 * Parse comma-separated or single email address
 */
function emailToArray(email: string): string[] {
  if (email.includes(',')) {
    return email.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  }
  return [email];
}

/**
 * Prepare report data from tasks array
 */
export function prepareReportData(tasks: any[]): ReportData {
  const totalTasks = tasks.length;
  
  // Status counts
  const statuses = ['live', 'inprogress', 'blocked', 'todo', 'done'];
  const byStatus: Record<string, number> = {};
  
  statuses.forEach(status => {
    byStatus[status] = tasks.filter((t: any) => t.system_status?.toLowerCase() === status).length;
  });

  const completedTasks = byStatus['done'] || 0;
  const liveTasks = byStatus['live'] || 0;
  const inProgressTasks = byStatus['inprogress'] || 0;
  const blockedTasks = byStatus['blocked'] || 0;
  const todoTasks = byStatus['todo'] || 0;

  // Overdue logic: To Do items with due date in the past
  const today = new Date();
  const overdueTasks = tasks.filter((t: any) => {
    const isTodo = (t.system_status || '').toLowerCase() === 'todo';
    const dueDate = t.due_on ? new Date(t.due_on) : null;
    const isPastDue = dueDate && !isNaN(dueDate.getTime()) && dueDate < today;
    return isTodo && isPastDue;
  }).length;

  // By assignee
  const byAssignee: Record<string, number[]> = {};
  tasks.forEach((t: any) => {
    const assignee = t.assignee_name || 'Unassigned';
    if (!byAssignee[assignee]) {
      byAssignee[assignee] = [];
    }
    byAssignee[assignee].push(t.id);
  });

  // Recent activities (last 10 tasks sorted by updated_at)
  const recentActivities = tasks
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10)
    .map((t: any) => ({
      taskId: t.id,
      subject: t.subject || t.subject || 'Untitled',
      status: t.system_status || 'unknown',
      dueDate: t.due_on || null,
      assignee: t.assignee_name || 'Unassigned',
    }));

  return {
    totalTasks,
    completedTasks,
    overdueTasks,
    liveTasks,
    inProgressTasks,
    blockedTasks,
    todoTasks,
    byStatus,
    byAssignee,
    recentActivities,
    generatedAt: new Date().toISOString(),
  };
}