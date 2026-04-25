import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '13px' },
  '.cm-content': { fontFamily: 'ui-monospace, monospace', minHeight: '160px', padding: '8px 12px' },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { display: 'none' },
});

const darkTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '13px' },
  '.cm-content': { fontFamily: 'ui-monospace, monospace', minHeight: '160px', padding: '8px 12px' },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { display: 'none' },
}, { dark: true });

export function JsonEditor({ value, onChange, disabled }: Props) {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      editable={!disabled}
      extensions={[json()]}
      theme={isDark ? [oneDark, darkTheme] : lightTheme}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      className="rounded-b-md text-sm"
    />
  );
}
