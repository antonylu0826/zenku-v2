import { useEffect, useRef, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { cn } from '../lib/cn';

// ── Mermaid code block ────────────────────────────────────────────────────────

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;

    import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return;
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, code).then(({ svg }) => {
        if (cancelled || !el) return;
        el.innerHTML = svg;
      }).catch(() => {
        if (cancelled || !el) return;
        el.textContent = code;
      });
    });

    return () => { cancelled = true; };
  }, [code]);

  return <div ref={ref} className="my-3 overflow-x-auto rounded-md border bg-muted/30 p-4" />;
}

// ── Custom components ─────────────────────────────────────────────────────────

const components: Components = {
  // Code blocks — detect mermaid
  code({ className, children, ...props }) {
    const language = /language-(\w+)/.exec(className ?? '')?.[1];
    const isInline = !className;

    if (!isInline && language === 'mermaid') {
      return <MermaidBlock code={String(children).trim()} />;
    }

    if (isInline) {
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
          {children}
        </code>
      );
    }

    return (
      <pre className="my-3 overflow-x-auto rounded-md bg-muted p-4">
        <code className="font-mono text-xs">{children}</code>
      </pre>
    );
  },

  // Tables
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-md border border-muted-foreground/25">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted-foreground/10">{children}</thead>;
  },
  th({ children }) {
    return <th className="border-b border-muted-foreground/25 px-3 py-2 text-left font-medium">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-muted-foreground/25 px-3 py-2 last:border-b-0">{children}</td>;
  },

  // Headings
  h1({ children }) { return <h1 className="mb-2 mt-4 text-lg font-bold">{children}</h1>; },
  h2({ children }) { return <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>; },
  h3({ children }) { return <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>; },

  // Lists
  ul({ children }) { return <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>; },
  ol({ children }) { return <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>; },
  li({ children }) { return <li className="leading-relaxed">{children}</li>; },

  // Blockquote
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground italic">
        {children}
      </blockquote>
    );
  },

  // Strong / em
  strong({ children }) { return <strong className="font-semibold">{children}</strong>; },

  // Horizontal rule
  hr() { return <hr className="my-3 border-border" />; },

  // Links
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
};

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  content: string;
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={cn('prose-sm leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
