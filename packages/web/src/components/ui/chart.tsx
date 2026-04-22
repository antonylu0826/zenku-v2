import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '../../lib/cn';

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within <ChartContainer />');
  return context;
}

// Injects --color-{key} CSS variables scoped to the chart container
const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorEntries = Object.entries(config).filter(([, c]) => c.color);
  if (!colorEntries.length) return null;

  const lightVars = colorEntries.map(([k, c]) => `  --color-${k}: ${c.color};`).join('\n');
  const darkVars  = colorEntries.map(([k, c]) => `  --color-${k}: ${c.color};`).join('\n');

  return (
    <style dangerouslySetInnerHTML={{ __html:
      `[data-chart="${id}"] {\n${lightVars}\n}\n.dark [data-chart="${id}"] {\n${darkVars}\n}`
    }} />
  );
};

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { config: ChartConfig }
>(({ id, className, children, config, ...props }, ref) => {
  const uid = React.useId();
  const chartId = `chart-${id ?? uid.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-chart={chartId}
        className={cn(
          // Override Recharts default colours with theme tokens via CSS attribute selectors
          '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
          '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',
          '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted',
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
          '[&_.recharts-layer]:outline-none',
          '[&_.recharts-surface]:outline-none',
          'relative w-full text-xs',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {children}
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'ChartContainer';

// ── Tooltip ───────────────────────────────────────────────────────────────────

export const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipPayloadItem {
  name?: string;
  dataKey?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: unknown;
    labelFormatter?: (label: unknown, payload: TooltipPayloadItem[]) => React.ReactNode;
    labelClassName?: string;
    formatter?: (value: unknown, name: string, item: TooltipPayloadItem, index: number) => React.ReactNode;
    color?: string;
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'dot' | 'line' | 'dashed';
    nameKey?: string;
    labelKey?: string;
  }
>(({
  active, payload, className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label, labelFormatter, labelClassName,
  formatter, color, nameKey, labelKey,
}, ref) => {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;
    const [item] = payload;
    const key = labelKey ?? String(item.dataKey ?? item.name ?? 'value');
    const itemConfig = config[key];
    const value = itemConfig?.label ?? (typeof label === 'string' ? label : undefined);
    if (labelFormatter) {
      return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>;
    }
    if (!value) return null;
    return <div className={cn('font-medium', labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) return null;

  const nestLabel = payload.length === 1 && indicator !== 'dot';

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = nameKey ?? String(item.name ?? item.dataKey ?? 'value');
          const itemConfig = config[key];
          const indicatorColor = color ?? String(item.payload?.fill ?? item.color ?? '');

          return (
            <div
              key={String(item.dataKey ?? index)}
              className={cn(
                'flex w-full flex-wrap items-stretch gap-2',
                indicator === 'dot' && 'items-center',
              )}
            >
              {formatter && item.value !== undefined && item.name
                ? formatter(item.value, item.name, item, index)
                : (
                  <>
                    {itemConfig?.icon
                      ? <itemConfig.icon />
                      : !hideIndicator && (
                        <div
                          className={cn('shrink-0 rounded-[2px]', {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                            'my-0.5': nestLabel && indicator === 'dashed',
                          })}
                          style={{
                            backgroundColor: indicator !== 'dashed' ? indicatorColor : undefined,
                            borderColor: indicator === 'dashed' ? indicatorColor : undefined,
                          }}
                        />
                      )
                    }
                    <div className={cn('flex flex-1 justify-between leading-none', nestLabel ? 'items-end' : 'items-center')}>
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                      </div>
                      {item.value !== undefined && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {Number(item.value).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = 'ChartTooltipContent';

// ── Legend ────────────────────────────────────────────────────────────────────

export const ChartLegend = RechartsPrimitive.Legend;

interface LegendItem {
  value?: string;
  dataKey?: string;
  color?: string;
}

export const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    payload?: LegendItem[];
    verticalAlign?: 'top' | 'bottom' | 'middle';
    hideIcon?: boolean;
    nameKey?: string;
  }
>(({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center gap-4',
        verticalAlign === 'top' ? 'pb-3' : 'pt-3',
        className,
      )}
    >
      {payload.map((item, i) => {
        const key = nameKey ?? String(item.dataKey ?? item.value ?? 'value');
        const itemConfig = config[key];
        return (
          <div key={String(item.value ?? i)} className="flex items-center gap-1.5">
            {itemConfig?.icon && !hideIcon
              ? <itemConfig.icon />
              : <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            }
            <span className="text-muted-foreground">{itemConfig?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = 'ChartLegendContent';
