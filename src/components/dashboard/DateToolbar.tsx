import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Settings2 } from 'lucide-react';
import { SourceBadge } from '../ui';
import { useToast } from '../ToastProvider';
import type { BoardSource } from '../../lib/snapshots';
import type { PeriodKey, WeekStart } from '../../lib/dates';
import { WEEK_START_OPTIONS } from '../../lib/dates';
import {
  DASHBOARD_DATE_BASIS_LABEL,
  DASHBOARD_DATE_BASIS_OPTIONS,
  DASHBOARD_STATUS_ORDER,
  type DashboardDateBasis,
  type DashboardStatusMode,
  type DashboardStatusModes,
} from '../../lib/dashboard';

interface DateToolbarProps {
  period: PeriodKey;
  customStart: string;
  customEnd: string;
  rangeLabel: string;
  boardDate: string;
  source: BoardSource;
  capturedAt?: string;
  dateBasis: DashboardDateBasis;
  weekStart: WeekStart;
  statusModes: DashboardStatusModes;
  unmappedTasks?: number;
  onSelectPeriod: (period: PeriodKey) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  onDateBasisChange: (basis: DashboardDateBasis) => void;
  onWeekStartChange: (weekStart: WeekStart) => void;
  onSetAllStatusModes: (mode: DashboardStatusMode) => void;
  onOpenMapping: () => void;
}

const PRESETS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'thisMonth', label: 'This Month' },
];

const PRESET_TOAST: Record<Exclude<PeriodKey, 'custom'>, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  thisMonth: 'This Month',
};

const WEEK_START_LABEL = Object.fromEntries(
  WEEK_START_OPTIONS.map((option) => [option.value, option.label])
) as Record<WeekStart, string>;

export default function DateToolbar({
  period,
  customStart,
  customEnd,
  rangeLabel,
  boardDate,
  source,
  capturedAt,
  dateBasis,
  weekStart,
  statusModes,
  unmappedTasks = 0,
  onSelectPeriod,
  onCustomRangeChange,
  onDateBasisChange,
  onWeekStartChange,
  onSetAllStatusModes,
  onOpenMapping,
}: DateToolbarProps) {
  const toast = useToast();
  const [customOpen, setCustomOpen] = useState(false);
  const customRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!customOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (customRef.current && !customRef.current.contains(event.target as Node)) {
        setCustomOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [customOpen]);

  const choosePreset = (next: PeriodKey) => {
    onSelectPeriod(next);
    setCustomOpen(false);
    toast.push(`Dashboard date scope updated: ${PRESET_TOAST[next as Exclude<PeriodKey, 'custom'>]}`);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) {
      toast.push('Please select both start and end dates.', 'error');
      return;
    }
    onCustomRangeChange(customStart, customEnd);
    onSelectPeriod('custom');
    setCustomOpen(false);
    toast.push('Custom date filter applied.');
  };

  const allPeriod = DASHBOARD_STATUS_ORDER.every((status) => statusModes[status] === 'period');
  const allAll = DASHBOARD_STATUS_ORDER.every((status) => statusModes[status] === 'all');

  const changeBasis = (next: DashboardDateBasis) => {
    onDateBasisChange(next);
    toast.push(`Dashboard counts now use: ${DASHBOARD_DATE_BASIS_LABEL[next]}`);
  };

  const changeWeekStart = (next: WeekStart) => {
    onWeekStartChange(next);
    toast.push(`Week now starts on ${WEEK_START_LABEL[next]}.`);
  };

  const setAllModes = (mode: DashboardStatusMode) => {
    onSetAllStatusModes(mode);
    toast.push(`All status cards set to ${mode === 'all' ? 'All time' : 'selected period'}.`);
  };

  return (
    <section className="border-b border-slate-200 bg-white py-3">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Timeframe Scope:
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-800">
            {rangeLabel}
          </span>
          <SourceBadge source={source} />
          {source === 'snapshot' && capturedAt && (
            <span className="text-[11px] text-slate-400">captured {new Date(capturedAt).toLocaleString()}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          {PRESETS.map((preset) => {
            const active = period === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => choosePreset(preset.value)}
                className={`rounded-lg border px-3 py-1.5 transition-all ${
                  active
                    ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-700 shadow-sm'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            );
          })}

          <div className="relative inline-block" ref={customRef}>
            <button
              type="button"
              onClick={() => setCustomOpen((open) => !open)}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 transition-all ${
                period === 'custom'
                  ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-700 shadow-sm'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-expanded={customOpen}
            >
              <span>Custom</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {customOpen && (
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <p className="mb-2 text-xs font-bold text-slate-700">Select Custom Date Range</p>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(event) => onCustomRangeChange(event.target.value, customEnd)}
                      className="w-full rounded-md border border-slate-200 p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(event) => onCustomRangeChange(customStart, event.target.value)}
                      className="w-full rounded-md border border-slate-200 p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyCustom}
                    className="mt-2 w-full rounded-md bg-indigo-600 py-1.5 text-xs font-semibold text-white transition-all hover:bg-indigo-700"
                  >
                    Apply Custom Range
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenMapping}
            title={
              unmappedTasks > 0
                ? `${unmappedTasks} task${unmappedTasks === 1 ? '' : 's'} on unmapped lists are excluded from the dashboard`
                : 'Status mapping'
            }
            className="relative ml-1 inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900"
            aria-label="Open status mapping"
          >
            <Settings2 className="h-4 w-4" />
            {unmappedTasks > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-sm">
                {unmappedTasks > 99 ? '99+' : unmappedTasks}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mx-auto mt-3 flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 pt-3 text-xs sm:px-6 lg:px-8">
        <label className="flex items-center gap-1.5 font-medium text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Count by</span>
          <select
            value={dateBasis}
            onChange={(event) => changeBasis(event.target.value as DashboardDateBasis)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Dashboard count date basis"
          >
            {DASHBOARD_DATE_BASIS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 font-medium text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Week starts</span>
          <select
            value={weekStart}
            onChange={(event) => changeWeekStart(event.target.value as WeekStart)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Week start day"
          >
            {WEEK_START_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide text-slate-400">All statuses</span>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setAllModes('period')}
              aria-label="Set all statuses to Period"
              aria-pressed={allPeriod}
              className={`rounded-md px-2 py-1 font-semibold transition-all ${
                allPeriod ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Period
            </button>
            <button
              type="button"
              onClick={() => setAllModes('all')}
              aria-label="Set all statuses to All time"
              aria-pressed={allAll}
              className={`rounded-md px-2 py-1 font-semibold transition-all ${
                allAll ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All
            </button>
          </div>
          {!allPeriod && !allAll && (
            <span className="text-[10px] font-semibold uppercase text-amber-600">Mixed</span>
          )}
        </div>

        <span className="text-[11px] text-slate-400">
          {DASHBOARD_DATE_BASIS_LABEL[dateBasis]} filters the dashboard
          {dateBasis === 'updated' ? ' (falls back to Created date)' : ''}. Each card can switch
          between the period and All.
        </span>
      </div>

      <div className="mx-auto mt-2 w-full max-w-7xl px-4 text-[11px] text-slate-400 sm:px-6 lg:px-8">
        Board as of {boardDate}
        {source === 'approximate' &&
          ' · reconstructed from tasks created by this date using their current list/status.'}
        {source === 'live' && ' · live from the current board.'}
        {source === 'snapshot' &&
          ' · historical aggregates remain in Detailed breakdown; dashboard status counts use current tasks and the selected date basis.'}
      </div>
    </section>
  );
}
