import { useTranslation } from 'react-i18next';
import type { ViewDefinition } from '../../types';

interface Props {
  view: ViewDefinition;
}

export function EmbedView({ view }: Props) {
  const { t } = useTranslation();
  const embed = view.embed;

  if (!embed || (!embed.url && !embed.html)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('embed.missing_config')}
      </div>
    );
  }

  if (embed.url) {
    return (
      <div className="h-full w-full bg-muted/30 p-2 md:p-4">
        <iframe
          src={embed.url}
          className="h-full w-full rounded-md border bg-background shadow-sm"
          title={view.name}
          allow="clipboard-read; clipboard-write"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // HTML mode — sandboxed srcdoc
  return (
    <div className="h-full w-full bg-muted/30 p-2 md:p-4">
      <iframe
        srcDoc={embed.html}
        className="h-full w-full rounded-md border bg-background shadow-sm"
        title={view.name}
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      />
    </div>
  );
}
