import type { DashboardWidget } from '../../../types';
import type { ChartConfig } from '../../ui/chart';

export const SLOT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function buildConfig(
  entries: { key: string; label: string; colorIndex?: number }[],
): ChartConfig {
  return Object.fromEntries(
    entries.map(({ key, label, colorIndex = 0 }) => [
      key,
      { label, color: SLOT_COLORS[colorIndex % SLOT_COLORS.length] },
    ]),
  );
}

export function colSpanClass(size: DashboardWidget['size']): string {
  switch (size) {
    case 'sm':
      return 'col-span-12 sm:col-span-6 lg:col-span-3';
    case 'md':
      return 'col-span-12 sm:col-span-6';
    case 'lg':
      return 'col-span-12 lg:col-span-9';
    case 'full':
      return 'col-span-12';
    default:
      return 'col-span-12 sm:col-span-6';
  }
}

export function formatNumber(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v ?? '');
}
