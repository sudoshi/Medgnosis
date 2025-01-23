'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  className?: string;
  readOnly?: boolean;
  minLines?: number;
  maxLines?: number;
  showLineNumbers?: boolean;
  highlightActiveLine?: boolean;
  theme?: 'light' | 'dark';
  fontSize?: number;
  tabSize?: number;
  enableBasicAutocompletion?: boolean;
  enableLiveAutocompletion?: boolean;
  enableSnippets?: boolean;
  onLoad?: () => void;
}

export const CodeEditor = forwardRef<HTMLDivElement, CodeEditorProps>(
  ({
    value,
    onChange,
    language = 'javascript',
    className,
    readOnly = false,
    minLines,
    maxLines,
    showLineNumbers = true,
    highlightActiveLine = true,
    theme = 'dark',
    fontSize = 14,
    tabSize = 2,
    enableBasicAutocompletion = true,
    enableLiveAutocompletion = true,
    enableSnippets = true,
    onLoad,
  }, ref) => {
    const editorRef = useRef<any>(null);
    const [editor, setEditor] = useState<any>(null);
    const [ace, setAce] = useState<any>(null);

    useEffect(() => {
      let mounted = true;

      const loadAce = async () => {
        try {
          const aceModule = await import('ace-builds');
          const ace = aceModule.default;

          // Set the base path for ace
          ace.config.set('basePath', '/ace-builds/');

          // Load required extensions
          await Promise.all([
            import('ace-builds/src-noconflict/mode-javascript'),
            import('ace-builds/src-noconflict/mode-typescript'),
            import('ace-builds/src-noconflict/mode-html'),
            import('ace-builds/src-noconflict/mode-css'),
            import('ace-builds/src-noconflict/mode-json'),
            import('ace-builds/src-noconflict/theme-monokai'),
            import('ace-builds/src-noconflict/theme-github'),
            import('ace-builds/src-noconflict/ext-language_tools'),
          ]);

          if (mounted) {
            setAce(ace);
          }
        } catch (error) {
          console.error('Failed to load Ace editor:', error);
        }
      };

      loadAce();

      return () => {
        mounted = false;
      };
    }, []);

    useEffect(() => {
      if (!ace || !editorRef.current) return;

      const editor = ace.edit(editorRef.current);

      editor.setTheme(theme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/github');
      editor.session.setMode(`ace/mode/${language}`);
      editor.setReadOnly(readOnly);
      editor.setFontSize(fontSize);
      editor.session.setTabSize(tabSize);
      editor.session.setUseWrapMode(true);
      editor.setShowPrintMargin(false);

      if (minLines) editor.setMinLines(minLines);
      if (maxLines) editor.setMaxLines(maxLines);

      editor.setOptions({
        enableBasicAutocompletion,
        enableLiveAutocompletion,
        enableSnippets,
        showLineNumbers,
        highlightActiveLine,
      });

      editor.setValue(value, -1);

      editor.on('change', () => {
        const newValue = editor.getValue();
        onChange?.(newValue);
      });

      setEditor(editor);
      onLoad?.();

      return () => {
        editor.destroy();
        editor.container.remove();
      };
    }, [
      ace,
      value,
      onChange,
      language,
      readOnly,
      minLines,
      maxLines,
      showLineNumbers,
      highlightActiveLine,
      theme,
      fontSize,
      tabSize,
      enableBasicAutocompletion,
      enableLiveAutocompletion,
      enableSnippets,
      onLoad,
    ]);

    useEffect(() => {
      if (editor && value !== editor.getValue()) {
        const cursorPosition = editor.getCursorPosition();
        editor.setValue(value, -1);
        editor.moveCursorToPosition(cursorPosition);
      }
    }, [editor, value]);

    return (
      <div
        ref={ref}
        className={cn('relative rounded-md border border-dark-border', className)}
      >
        <div
          ref={editorRef}
          className={cn(
            'w-full rounded-md font-mono',
            readOnly && 'opacity-70'
          )}
          style={{ height: minLines ? `${minLines * 20}px` : '300px' }}
        />
      </div>
    );
  }
);
CodeEditor.displayName = 'CodeEditor';
