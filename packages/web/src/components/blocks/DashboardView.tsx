import { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, ResponsiveContainer,
} from 'recharts';
import { runQuery } from '../../api';
import type { DashboardWidget, ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '../ui/chart';
import { cn } from '../../lib/cn';

interface Props {
  view: ViewDefinition;
}

function colSpanClass(size: DashboardWidget['size']) {
  switch (size) {
    case 'sm':   return 'col-span-12 sm:col-span-6 lg:col-span-3';
    case 'md':   return 'col-span-12 sm:col-span-6';
    case 'lg':   return 'col-span-12 lg:col-span-9';
    case 'full': return 'col-span-12';
    default:     return 'col-span-12 sm:col-span-6';
  }
}

// The 5 chart colour slots — referenced as var(--color-{key}) inside ChartContainer
const SLOT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

// Build a ChartConfig from a list of { key, label } pairs
function buildConfig(entries: { key: string; label: string; colorIndex?: number }[]): ChartConfig {
  return Object.fromEntries(
    entries.map(({ key, label, colorIndex = 0 }) => [
      key,
      { label, color: SLOT_COLORS[colorIndex % SLOT_COLORS.length] },
    ]),
  );
}

export function DashboardView({ view }: Props) {
  const { t } = useTranslation();
  const widgets = view.widgets ?? [];
  const [refreshKey, setRefreshKey] = useState(0);

  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of view.form?.fields ?? []) map[f.key] = f.label;
    return map;
  }, [view.form?.fields]);

  if (widgets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('dashboard.no_widgets')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{view.name}</h2>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {t('common.refresh')}
        </Button>
      </div>
      <div className="grid grid-cols-12 gap-4">
        {widgets.map(widget => (
          <div key={widget.id} className={colSpanClass(widget.size)}>
            <WidgetRenderer widget={widget} refreshKey={refreshKey} fieldLabelMap={fieldLabelMap} />
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetRenderer({
  widget, refreshKey, fieldLabelMap,
}: {
  widget: DashboardWidget;
  refreshKey: number;
  fieldLabelMap: Record<string, string>;
}) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    runQuery(widget.query)
      .then(rows => { if (!cancelled) setData(rows); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [widget.query, refreshKey]);

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-sm text-destructive">{widget.title}</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-destructive">{error}</p></CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">{widget.title}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const columnLabels = (widget.config?.column_labels ?? {}) as Record<string, string>;
  const labelMap = { ...fieldLabelMap, ...columnLabels };
  const p = { title: widget.title, data, config: widget.config, labelMap };

  switch (widget.type) {
    case 'stat_card':  return <StatCard title={widget.title} data={data} config={widget.config} />;
    case 'trend_card': return <TrendCard widget={widget} data={data} />;
    case 'bar_chart':  return <BarChartWidget {...p} />;
    case 'line_chart': return <LineChartWidget {...p} />;
    case 'area_chart': return <AreaChartWidget {...p} />;
    case 'pie_chart':  return <PieChartWidget {...p} />;
    case 'mini_table': return <MiniTableWidget title={widget.title} data={data} labelMap={labelMap} />;
    default:           return null;
  }
}

// ===== Stat Card =====

function StatCard({
  title, data, config,
}: { title: string; data: Record<string, unknown>[]; config?: Record<string, unknown> }) {
  const row = data[0] ?? {};
  const value = row.value ?? row.count ?? row.total ?? row.current_value ?? Object.values(row)[0] ?? 0;
  const num = Number(value);
  const display = Number.isFinite(num) ? num.toLocaleString() : String(value);

  const rawDelta = row.delta ?? row.delta_percent;
  const prev = row.previous_value != null ? Number(row.previous_value) : null;
  const delta = rawDelta != null
    ? Number(rawDelta)
    : (prev !== null && prev !== 0 ? ((num - prev) / Math.abs(prev)) * 100 : null);
  const isUp = delta !== null && delta >= 0;
  const description = config?.description as string | undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {delta !== null && (
            <span className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
              isUp
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400',
            )}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{display}</p>
        {description && <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ===== Trend Card =====

function TrendCard({ widget, data }: { widget: DashboardWidget; data: Record<string, unknown>[] }) {
  const { t } = useTranslation();
  const row = data[0];
  if (!row) return (
    <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('common.no_data')}</CardContent></Card>
  );

  const curr = Number(row.current_value ?? 0);
  const prev = Number(row.previous_value ?? 0);
  const delta = prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;
  const isUp = delta !== null && delta >= 0;
  const description = widget.config?.description as string | undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
          {delta !== null && (
            <span className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
              isUp
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400',
            )}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{curr.toLocaleString()}</p>
        {row.label != null && <p className="mt-1.5 text-xs text-muted-foreground">{String(row.label)}</p>}
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ===== Bar Chart =====

function BarChartWidget({ title, data, config, labelMap }: {
  title: string; data: Record<string, unknown>[]; config?: Record<string, unknown>; labelMap: Record<string, string>;
}) {
  const xKey = String(config?.x_key ?? config?.label_key ?? 'label');
  const yKey = String(config?.y_key ?? config?.value_key ?? 'value');
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={yKey} fill={`var(--color-${yKey})`} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===== Line Chart =====

function LineChartWidget({ title, data, config, labelMap }: {
  title: string; data: Record<string, unknown>[]; config?: Record<string, unknown>; labelMap: Record<string, string>;
}) {
  const xKey = String(config?.x_key ?? config?.label_key ?? 'label');
  const yKey = String(config?.y_key ?? config?.value_key ?? 'value');
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey={yKey} stroke={`var(--color-${yKey})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===== Area Chart =====

function AreaChartWidget({ title, data, config, labelMap }: {
  title: string; data: Record<string, unknown>[]; config?: Record<string, unknown>; labelMap: Record<string, string>;
}) {
  const xKey = String(config?.x_key ?? config?.label_key ?? 'label');
  const yKey = String(config?.y_key ?? config?.value_key ?? 'value');
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);
  const gradientId = `area-fill-${yKey}`;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={`var(--color-${yKey})`} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={`var(--color-${yKey})`} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke={`var(--color-${yKey})`}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===== Pie Chart (donut) =====

function PieChartWidget({ title, data, config, labelMap }: {
  title: string; data: Record<string, unknown>[]; config?: Record<string, unknown>; labelMap: Record<string, string>;
}) {
  const labelKey  = String(config?.label_key ?? config?.x_key ?? 'label');
  const valueKey  = String(config?.value_key ?? config?.y_key ?? 'value');

  // Build a config entry per data row so ChartLegendContent gets labels & colours
  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    data.forEach((row, i) => {
      const k = String(row[labelKey] ?? i);
      cfg[k] = { label: labelMap[k] ?? k, color: SLOT_COLORS[i % SLOT_COLORS.length] };
    });
    return cfg;
  }, [data, labelKey, labelMap]);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={labelKey}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                paddingAngle={2}
              >
                {data.map((row, i) => {
                  const k = String(row[labelKey] ?? i);
                  return <Cell key={k} fill={chartConfig[k]?.color ?? SLOT_COLORS[i % SLOT_COLORS.length]} />;
                })}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent nameKey={labelKey} />} />
              <ChartLegend content={(props) => (
                <ChartLegendContent
                  payload={(props.payload as Parameters<typeof ChartLegendContent>[0]['payload'])}
                  verticalAlign={props.verticalAlign as 'top' | 'bottom' | 'middle' | undefined}
                  nameKey={labelKey}
                />
              )} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===== Mini Table =====

function MiniTableWidget({ title, data, labelMap }: {
  title: string; data: Record<string, unknown>[]; labelMap: Record<string, string>;
}) {
  const { t } = useTranslation();
  if (data.length === 0) return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-xs text-muted-foreground">{t('common.no_data')}</p></CardContent>
    </Card>
  );

  const columns = Object.keys(data[0]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0 pb-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map(col => (
                <TableHead key={col} className="h-8 px-4 text-xs font-medium">
                  {labelMap[col] ?? col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 10).map((row, i) => (
              <TableRow key={i}>
                {columns.map(col => (
                  <TableCell key={col} className="px-4 py-2 text-xs">
                    {String(row[col] ?? '-')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
