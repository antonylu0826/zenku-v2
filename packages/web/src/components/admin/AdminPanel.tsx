import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, MessageSquare, BarChart2, ShieldCheck,
  LayoutTemplate, Key, Package, X, LogIn, Languages,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { UserManagement } from './UserManagement';
import { ChatHistory } from './ChatHistory';
import { UsageStats } from './UsageStats';
import { RulesManagement } from './RulesManagement';
import { ViewManagement } from './ViewManagement';
import { ApiKeyManagement } from './ApiKeyManagement';
import { BundleManagement } from './BundleManagement';
import { OidcManagement } from './OidcManagement';
import { TranslationCenter } from './TranslationCenter';

// ─── Tab definitions ──────────────────────────────────────────────────────────

export type AdminTab =
  | 'users'
  | 'chat'
  | 'usage'
  | 'rules'
  | 'views'
  | 'api-keys'
  | 'bundle'
  | 'oidc'
  | 'translations';

interface NavItem {
  id: AdminTab;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'users',        icon: Users,         labelKey: 'admin.menu.user_mgmt'      },
  { id: 'chat',         icon: MessageSquare, labelKey: 'admin.menu.chat_history'    },
  { id: 'usage',        icon: BarChart2,     labelKey: 'admin.menu.usage_stats'     },
  { id: 'rules',        icon: ShieldCheck,   labelKey: 'admin.menu.rules_mgmt'      },
  { id: 'views',        icon: LayoutTemplate,labelKey: 'admin.menu.view_mgmt'       },
  { id: 'api-keys',     icon: Key,           labelKey: 'admin.menu.api_keys'        },
  { id: 'bundle',       icon: Package,       labelKey: 'admin.menu.bundle'          },
  { id: 'oidc',         icon: LogIn,         labelKey: 'admin.menu.oidc'            },
  { id: 'translations', icon: Languages,     labelKey: 'admin.menu.translations'    },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialTab?: AdminTab;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPanel({ initialTab = 'users', onClose }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* ── Left sidebar ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b px-4 py-3.5">
          <span className="text-sm font-semibold text-foreground">
            {t('admin.panel.title', { defaultValue: 'Settings' })}
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon size={15} className="shrink-0" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Content area ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'users'        && <UserManagement />}
        {activeTab === 'chat'         && <ChatHistory />}
        {activeTab === 'usage'        && <UsageStats />}
        {activeTab === 'rules'        && <RulesManagement />}
        {activeTab === 'views'        && <ViewManagement />}
        {activeTab === 'api-keys'     && <ApiKeyManagement />}
        {activeTab === 'bundle'       && <BundleManagement />}
        {activeTab === 'oidc'         && <OidcManagement />}
        {activeTab === 'translations' && <TranslationCenter />}
      </main>
    </div>
  );
}
