import { TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader } from '../../ui/card';
import type { DashboardWidget } from '../../../types';
import { formatNumber } from './utils';

interface Props {
  title: string;
  value: string;
  delta: number | null;
  hint?: string;
}

export function MetricCard({ title, value, delta, hint }: Props) {
  const isUp = delta !== null && delta >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <Card className="h-full bg-gradient-to-t from-primary/5 to-card shadow-sm dark:from-card">
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl font-medium leading-none tracking-tight tabular-nums">{value}</div>
          {delta !== null && (
            <Badge variant={isUp ? 'default' : 'destructive'} className="gap-1">
              <TrendIcon className="size-3" />
              {isUp ? '+' : ''}
              {delta.toFixed(1)}%
            </Badge>
          )}
        </div>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatCardWidget({
  title,
  data,
  config,
}: {
  title: string;
  data: Record<string, unknown>[];
  config?: Record<string, unknown>;
}) {
  const row = data[0] ?? {};
  const value =
    row.value ??
    row.count ??
    row.total ??
    row.current_value ??
    Object.values(row)[0] ??
    0;
  const num = Number(value);
  const display = Number.isFinite(num) ? num.toLocaleString() : String(value);

  const rawDelta = row.delta ?? row.delta_percent;
  const prev = row.previous_value != null ? Number(row.previous_value) : null;
  const delta =
    rawDelta != null
      ? Number(rawDelta)
      : prev !== null && prev !== 0
        ? ((num - prev) / Math.abs(prev)) * 100
        : null;

  return (
    <MetricCard
      title={title}
      value={display}
      delta={delta}
      hint={config?.description as string | undefined}
    />
  );
}

export function TrendCardWidget({
  widget,
  data,
}: {
  widget: DashboardWidget;
  data: Record<string, unknown>[];
}) {
  const row = data[0];
  if (!row) {
    return <MetricCard title={widget.title} value="—" delta={null} />;
  }

  const curr = Number(row.current_value ?? 0);
  const prev = Number(row.previous_value ?? 0);
  const delta = prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;

  const description = widget.config?.description as string | undefined;
  const label = row.label != null ? String(row.label) : undefined;
  const hint = [label, description].filter(Boolean).join(' · ') || undefined;

  return (
    <MetricCard
      title={widget.title}
      value={formatNumber(curr)}
      delta={delta}
      hint={hint}
    />
  );
}
