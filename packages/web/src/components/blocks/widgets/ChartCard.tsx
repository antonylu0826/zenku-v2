import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../ui/chart';
import { SLOT_COLORS, buildConfig } from './utils';

interface ShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function ChartCardShell({ title, subtitle, children }: ShellProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface ChartProps {
  title: string;
  data: Record<string, unknown>[];
  config?: Record<string, unknown>;
  labelMap: Record<string, string>;
}

function readKeys(config?: Record<string, unknown>) {
  return {
    xKey: String(config?.x_key ?? config?.label_key ?? 'label'),
    yKey: String(config?.y_key ?? config?.value_key ?? 'value'),
  };
}

function readSubtitle(config?: Record<string, unknown>): string | undefined {
  const s = config?.subtitle ?? config?.description;
  return typeof s === 'string' && s ? s : undefined;
}

export function BarChartWidget({ title, data, config, labelMap }: ChartProps) {
  const { xKey, yKey } = readKeys(config);
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);

  return (
    <ChartCardShell title={title} subtitle={readSubtitle(config)}>
      <ChartContainer config={chartConfig} className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: string) => labelMap[String(v)] ?? String(v)} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={SLOT_COLORS[i % SLOT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function LineChartWidget({ title, data, config, labelMap }: ChartProps) {
  const { xKey, yKey } = readKeys(config);
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);

  return (
    <ChartCardShell title={title} subtitle={readSubtitle(config)}>
      <ChartContainer config={chartConfig} className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={`var(--color-${yKey})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function AreaChartWidget({ title, data, config, labelMap }: ChartProps) {
  const { xKey, yKey } = readKeys(config);
  const chartConfig = buildConfig([{ key: yKey, label: labelMap[yKey] ?? yKey }]);
  const gradientId = `area-fill-${yKey}`;

  return (
    <ChartCardShell title={title} subtitle={readSubtitle(config)}>
      <ChartContainer config={chartConfig} className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${yKey})`} stopOpacity={0.4} />
                <stop offset="95%" stopColor={`var(--color-${yKey})`} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
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
    </ChartCardShell>
  );
}

export function PieChartWidget({ title, data, config, labelMap }: ChartProps) {
  const labelKey = String(config?.label_key ?? config?.x_key ?? 'label');
  const valueKey = String(config?.value_key ?? config?.y_key ?? 'value');

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    data.forEach((row, i) => {
      const k = String(row[labelKey] ?? i);
      cfg[k] = { label: labelMap[k] ?? k, color: SLOT_COLORS[i % SLOT_COLORS.length] };
    });
    return cfg;
  }, [data, labelKey, labelMap]);

  return (
    <ChartCardShell title={title} subtitle={readSubtitle(config)}>
      <ChartContainer config={chartConfig} className="w-full">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={labelKey}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((row, i) => {
                const k = String(row[labelKey] ?? i);
                return (
                  <Cell
                    key={k}
                    fill={chartConfig[k]?.color ?? SLOT_COLORS[i % SLOT_COLORS.length]}
                  />
                );
              })}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent nameKey={labelKey} />} />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((row, i) => {
          const k = String(row[labelKey] ?? i);
          const color = chartConfig[k]?.color ?? SLOT_COLORS[i % SLOT_COLORS.length];
          return (
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {labelMap[k] ?? k}
            </div>
          );
        })}
      </div>
    </ChartCardShell>
  );
}
