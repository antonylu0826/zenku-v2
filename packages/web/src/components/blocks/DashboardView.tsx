import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { runQuery } from '../../api';
import type { DashboardWidget, ViewDefinition } from '../../types';
import { useViews } from '../../contexts/ViewsContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { StatCardWidget, TrendCardWidget } from './widgets/MetricCard';
import {
  AreaChartWidget,
  BarChartWidget,
  LineChartWidget,
  PieChartWidget,
} from './widgets/ChartCard';
import { MiniTableWidget } from './widgets/TableCard';
import { colSpanClass } from './widgets/utils';

interface Props {
  view: ViewDefinition;
}

export function DashboardView({ view }: Props) {
  const { t } = useTranslation();
  const { views } = useViews();
  const widgets = view.widgets ?? [];
  const [refreshKey, setRefreshKey] = useState(0);

  // Build label map across all views so mini_table widgets can resolve column
  // names from any table, not just the current view's form fields.
  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of views) {
      for (const f of v.form?.fields ?? []) if (f.key && f.label) map[f.key] = f.label;
      for (const c of v.columns ?? []) if (c.key && c.label) map[c.key] = c.label;
    }
    return map;
  }, [views]);

  if (widgets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('dashboard.no_widgets')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{view.name}</h2>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {t('common.refresh')}
        </Button>
      </div>
      <div className="grid grid-cols-12 gap-4 md:gap-5">
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
  widget,
  refreshKey,
  fieldLabelMap,
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
      .then(rows => {
        if (!cancelled) setData(rows);
      })
      .catch(err => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [widget.query, refreshKey]);

  if (error) {
    return (
      <Card className="h-full border-destructive/40">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm">{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const columnLabels = (widget.config?.column_labels ?? {}) as Record<string, string>;
  const labelMap = { ...fieldLabelMap, ...columnLabels };
  const chartProps = { title: widget.title, data, config: widget.config, labelMap };

  switch (widget.type) {
    case 'stat_card':
      return <StatCardWidget title={widget.title} data={data} config={widget.config} />;
    case 'trend_card':
      return <TrendCardWidget widget={widget} data={data} />;
    case 'bar_chart':
      return <BarChartWidget {...chartProps} />;
    case 'line_chart':
      return <LineChartWidget {...chartProps} />;
    case 'area_chart':
      return <AreaChartWidget {...chartProps} />;
    case 'pie_chart':
      return <PieChartWidget {...chartProps} />;
    case 'mini_table':
      return <MiniTableWidget title={widget.title} data={data} labelMap={labelMap} />;
    default:
      return null;
  }
}
