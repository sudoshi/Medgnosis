'use client';

import { forwardRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEditor, EditorContent } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  ListBulletIcon,
  Bars3Icon,
  ChatBubbleLeftIcon,
  CodeBracketIcon,
  LinkIcon,
  PhotoIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(
  ({
    value,
    onChange,
    className,
    placeholder = 'Write something...',
    readOnly = false,
    minHeight = 200,
    maxHeight,
  }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Highlight,
        Typography,
        Link.configure({
          openOnClick: false,
        }),
        Image.configure({
          inline: true,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
      ],
      content: value,
      editable: !readOnly,
      onUpdate: ({ editor }) => {
        onChange?.(editor.getHTML());
      },
      editorProps: {
        attributes: {
          class: cn(
            'prose prose-invert max-w-none focus:outline-none',
            'prose-headings:mb-3 prose-headings:mt-6 prose-headings:font-semibold prose-headings:text-dark-text-primary',
            'prose-p:my-3 prose-p:leading-7',
            'prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline',
            'prose-code:rounded-md prose-code:bg-dark-border prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal',
            'prose-pre:mt-2 prose-pre:bg-dark-border prose-pre:p-4',
            'prose-img:my-8 prose-img:rounded-md',
            'prose-hr:my-8 prose-hr:border-dark-border',
            'prose-blockquote:border-l-4 prose-blockquote:border-dark-border prose-blockquote:pl-4 prose-blockquote:italic',
            'prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6',
            'prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6',
            'prose-li:my-1',
            'prose-table:my-6 prose-table:w-full prose-table:border-collapse',
            'prose-th:border prose-th:border-dark-border prose-th:p-2 prose-th:text-left',
            'prose-td:border prose-td:border-dark-border prose-td:p-2'
          ),
        },
      },
    });

    const ToolbarButton = useCallback(({ 
      onClick, 
      icon: Icon, 
      isActive = false,
      disabled = false,
    }: { 
      onClick: () => void;
      icon: React.ComponentType<{ className?: string }>;
      isActive?: boolean;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded-md p-2 text-dark-text-secondary',
          'hover:bg-dark-border hover:text-dark-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isActive && 'bg-dark-border text-dark-text-primary'
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    ), []);

    if (!editor) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border border-dark-border bg-dark-secondary',
          className
        )}
      >
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1 border-b border-dark-border p-2">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              icon={BoldIcon}
              isActive={editor.isActive('bold')}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              icon={ItalicIcon}
              isActive={editor.isActive('italic')}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              icon={StrikethroughIcon}
              isActive={editor.isActive('strike')}
            />
            <div className="mx-2 h-6 w-px bg-dark-border" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              icon={ListBulletIcon}
              isActive={editor.isActive('bulletList')}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              icon={Bars3Icon}
              isActive={editor.isActive('orderedList')}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              icon={CheckIcon}
              isActive={editor.isActive('taskList')}
            />
            <div className="mx-2 h-6 w-px bg-dark-border" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              icon={ChatBubbleLeftIcon}
              isActive={editor.isActive('blockquote')}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              icon={CodeBracketIcon}
              isActive={editor.isActive('codeBlock')}
            />
            <div className="mx-2 h-6 w-px bg-dark-border" />
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('Enter the URL:');
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              }}
              icon={LinkIcon}
              isActive={editor.isActive('link')}
            />
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('Enter the image URL:');
                if (url) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              }}
              icon={PhotoIcon}
            />
            <div className="mx-2 h-6 w-px bg-dark-border" />
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              icon={ArrowUturnLeftIcon}
              disabled={!editor.can().undo()}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              icon={ArrowUturnRightIcon}
              disabled={!editor.can().redo()}
            />
          </div>
        )}
        <div
          className="p-4"
          style={{
            minHeight,
            maxHeight,
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);
RichTextEditor.displayName = 'RichTextEditor';
