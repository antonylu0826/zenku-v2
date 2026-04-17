import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, RefreshCw, TrendingUp, MessageSquare, Database, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface Totals {
  total_sessions: number;
  total_messages: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
}

interface ProviderStat {
  provider: string;
  sessions: number;
  messages: number;
  tokens: number;
  cost_usd: number;
}

interface UserStat {
  user_id: string;
  user_name: string;
  sessions: number;
  messages: number;
  tokens: number;
  cost_usd: number;
}

interface AgentStat {
  agent: string;
  calls: number;
  avg_latency_ms: number;
  error_count: number;
}

interface DailyStat {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  sessions: number;
}

interface UsageData {
  totals: Totals;
  byProvider: ProviderStat[];
  byUser: UserStat[];
  byAgent: AgentStat[];
  daily: DailyStat[];
}

interface Props {
  onClose: () => void;
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <Icon size={18} className="text-muted-foreground" />
      </div>
    </div>
  );
}

export function UsageStats({ onClose }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setData(await res.json() as UsageData);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchData(); }, []);

  const totals = data?.totals;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">{t('admin.usage.title')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchData()}
              className="rounded-md p-1.5 hover:bg-accent"
              title={t('common.refresh')}
            >
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !totals ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('admin.usage.load_error')}</div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  icon={TrendingUp}
                  label={t('admin.usage.label_total_cost')}
                  value={`$${(totals.total_cost_usd ?? 0).toFixed(4)}`}
                />
                <StatCard
                  icon={Database}
                  label={t('admin.usage.label_total_tokens')}
                  value={((totals.total_input_tokens ?? 0) + (totals.total_output_tokens ?? 0)).toLocaleString()}
                  sub={t('admin.usage.sub_token_in_out', { in: (totals.total_input_tokens ?? 0).toLocaleString(), out: (totals.total_output_tokens ?? 0).toLocaleString() })}
                />
                <StatCard
                  icon={MessageSquare}
                  label={t('admin.usage.label_total_sessions')}
                  value={(totals.total_sessions ?? 0).toLocaleString()}
                />
                <StatCard
                  icon={DollarSign}
                  label={t('admin.usage.label_total_messages')}
                  value={(totals.total_messages ?? 0).toLocaleString()}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Provider breakdown */}
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">{t('admin.usage.provider_dist')}</h3>
                  {data!.byProvider.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('common.no_data')}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left">{t('admin.usage.col_provider')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_sessions')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_tokens')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_cost')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data!.byProvider.map(p => (
                          <tr key={p.provider}>
                            <td className="py-1.5 font-medium capitalize">{p.provider}</td>
                            <td className="py-1.5 text-right tabular-nums">{p.sessions}</td>
                            <td className="py-1.5 text-right tabular-nums">{(p.tokens ?? 0).toLocaleString()}</td>
                            <td className="py-1.5 text-right tabular-nums">${(p.cost_usd ?? 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Agent stats */}
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">{t('admin.usage.agent_stats')}</h3>
                  {data!.byAgent.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('common.no_data')}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left">{t('admin.usage.col_agent')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_calls')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_avg_latency')}</th>
                          <th className="pb-2 text-right">{t('admin.usage.col_errors')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data!.byAgent.map(a => (
                          <tr key={a.agent}>
                            <td className="py-1.5 font-mono font-medium">{a.agent}</td>
                            <td className="py-1.5 text-right tabular-nums">{a.calls}</td>
                            <td className="py-1.5 text-right tabular-nums">{Math.round(a.avg_latency_ms)}ms</td>
                            <td className={`py-1.5 text-right tabular-nums ${a.error_count > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {a.error_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* User ranking */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">{t('admin.usage.user_ranking')}</h3>
                {data!.byUser.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('common.no_data')}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 text-left">{t('admin.usage.col_user')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_sessions')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_messages')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_tokens')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_cost')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data!.byUser.map(u => (
                        <tr key={u.user_id}>
                          <td className="py-1.5 font-medium">{u.user_name}</td>
                          <td className="py-1.5 text-right tabular-nums">{u.sessions}</td>
                          <td className="py-1.5 text-right tabular-nums">{u.messages}</td>
                          <td className="py-1.5 text-right tabular-nums">{(u.tokens ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums">${(u.cost_usd ?? 0).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Daily trend */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">{t('admin.usage.daily_trend')}</h3>
                {data!.daily.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('common.no_data')}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 text-left">{t('admin.usage.col_date')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_sessions')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_in_tokens')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_out_tokens')}</th>
                        <th className="pb-2 text-right">{t('admin.usage.col_cost')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data!.daily.map(d => (
                        <tr key={d.date}>
                          <td className="py-1.5 font-mono">{d.date}</td>
                          <td className="py-1.5 text-right tabular-nums">{d.sessions}</td>
                          <td className="py-1.5 text-right tabular-nums">{(d.input_tokens ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums">{(d.output_tokens ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums">${(d.cost_usd ?? 0).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
