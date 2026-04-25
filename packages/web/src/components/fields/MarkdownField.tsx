import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Extension } from '@tiptap/core';
import { createLowlight, common } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo, Quote, CodeSquare, Minus,
  Table as TableIcon, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/cn';
import type { FieldInputInnerProps, FieldReadonlyProps } from './registry';

// ─── Lowlight ────────────────────────────────────────────────────────────────

const lowlight = createLowlight(common);

// ─── Image-paste extension ────────────────────────────────────────────────────

const ImagePasteExtension = Extension.create({
  name: 'imagePaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imagePaste'),
        props: {
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const imgItem = items.find(i => i.type.startsWith('image/'));
            if (!imgItem) return false;
            const file = imgItem.getAsFile();
            if (!file) return false;
            const reader = new FileReader();
            reader.onload = e => {
              const src = e.target?.result as string;
              const node = view.state.schema.nodes.image?.create({ src });
              if (!node) return;
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            };
            reader.readAsDataURL(file);
            return true;
          },
        },
      }),
    ];
  },
});

// ─── Prose content styles ─────────────────────────────────────────────────────

const PROSE_CLASS = [
  'px-4 py-3 text-sm outline-none',
  '[&_p]:mb-2 [&_p:last-child]:mb-0',
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
  '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2',
  '[&_li]:mb-0.5',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-2',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]',
  '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:font-mono [&_pre_code]:text-[0.85em]',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_img]:max-w-full [&_img]:rounded-md [&_img]:my-2',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:my-2',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5',
  '[&_.is-empty::before]:text-muted-foreground [&_.is-empty::before]:content-[attr(data-placeholder)] [&_.is-empty::before]:float-left [&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:h-0',
].join(' ');

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

interface TBtnProps {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  asChild?: boolean;
}

function TBtn({ onClick, active, disabled, title, children }: TBtnProps) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="h-7 w-7"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function TDivider() {
  return <Separator orientation="vertical" className="mx-0.5 h-5" />;
}

// ─── URL Popover (link / image) ───────────────────────────────────────────────

interface UrlPopoverProps {
  active?: boolean;
  triggerTitle: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (url: string) => void;
  children: React.ReactNode;
}

function UrlPopover({ active, triggerTitle, placeholder, confirmLabel, onConfirm, children }: UrlPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setUrl('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) setTimeout(() => inputRef.current?.focus(), 50); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          title={triggerTitle}
          onClick={() => setOpen(v => !v)}
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex gap-1.5">
          <Input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') setOpen(false); }}
          />
          <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={handleConfirm}>
            <Check className="h-4 w-4" />
            <span className="sr-only">{confirmLabel}</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── MarkdownInput ────────────────────────────────────────────────────────────

export function MarkdownInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  const { t } = useTranslation();

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Markdown.configure({ html: false, transformPastedText: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: field.placeholder ?? '' }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: 'flex items-start gap-2 my-0.5' },
      }),
      ImagePasteExtension,
    ],
    content: String(value ?? ''),
    onUpdate({ editor: e }) {
      const md = (e.storage as Record<string, any>).markdown?.getMarkdown?.() ?? e.getHTML();
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    const current = (editor.storage as Record<string, any>).markdown?.getMarkdown?.() ?? '';
    const next = String(value ?? '');
    if (current !== next) editor.commands.setContent(next);
  }, [editor, value]);

  useEffect(() => () => { editor?.destroy(); }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn('rounded-md border bg-background', disabled && 'opacity-50 pointer-events-none')}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
        <TBtn title={t('markdown.editor.undo')} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.redo')} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo className="h-3.5 w-3.5" />
        </TBtn>

        <TDivider />

        <TBtn title={t('markdown.editor.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.strike')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.code_inline')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-3.5 w-3.5" />
        </TBtn>

        <TDivider />

        <TBtn title={t('markdown.editor.heading1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.heading2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.heading3')} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </TBtn>

        <TDivider />

        <TBtn title={t('markdown.editor.bullet_list')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.ordered_list')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.task_list')} active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListTodo className="h-3.5 w-3.5" />
        </TBtn>

        <TDivider />

        <TBtn title={t('markdown.editor.blockquote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.code_block')} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <CodeSquare className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn title={t('markdown.editor.hr')} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </TBtn>

        <TDivider />

        <TBtn title={t('markdown.editor.table')} active={editor.isActive('table')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="h-3.5 w-3.5" />
        </TBtn>

        <UrlPopover
          active={editor.isActive('link')}
          triggerTitle={t('markdown.editor.link')}
          placeholder={t('markdown.editor.link_placeholder')}
          confirmLabel={t('markdown.editor.confirm')}
          onConfirm={url => editor.chain().focus().setLink({ href: url }).run()}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </UrlPopover>

        <UrlPopover
          triggerTitle={t('markdown.editor.image')}
          placeholder={t('markdown.editor.image_placeholder')}
          confirmLabel={t('markdown.editor.confirm')}
          onConfirm={url => editor.chain().focus().setImage({ src: url }).run()}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </UrlPopover>
      </div>

      {/* ── Editor content ── */}
      <EditorContent editor={editor} className={cn('min-h-[200px]', PROSE_CLASS)} />
    </div>
  );
}

// ─── MarkdownReadonly ─────────────────────────────────────────────────────────

export function MarkdownReadonly({ value }: FieldReadonlyProps) {
  const content = String(value ?? '').trim();
  if (!content) return <span className="text-sm text-muted-foreground">-</span>;
  return (
    <div className={PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = !!className?.startsWith('language-');
            return isBlock ? (
              <code className={cn('block', className)} {...props}>{children}</code>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>{children}</code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
