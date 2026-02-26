// =============================================================================
// Medgnosis — SOAP Section Editor (TipTap rich text for clinical notes)
// Each SOAP section gets its own editor instance with AI generate button
// =============================================================================

import { useEffect } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo2,
  Redo2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SOAPSectionEditorProps {
  section: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (content: string) => void;
  onAiGenerate: () => void;
  isGenerating: boolean;
  isAiGenerated: boolean;
  readOnly: boolean;
}

// ─── Toolbar Button ──────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  icon: Icon,
  isActive = false,
  disabled = false,
  title,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  isActive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-1.5 text-ghost hover:bg-edge/30 hover:text-dim
        focus:outline-none focus:ring-1 focus:ring-teal/40
        disabled:cursor-not-allowed disabled:opacity-30
        transition-colors ${isActive ? 'bg-edge/30 text-bright' : ''}`}
    >
      <Icon size={14} strokeWidth={1.5} />
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SOAPSectionEditor({
  section,
  label,
  placeholder,
  value,
  onChange,
  onAiGenerate,
  isGenerating,
  isAiGenerated,
  readOnly,
}: SOAPSectionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
      }),
      Highlight,
      Typography,
      TiptapLink.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value || `<p></p>`,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: [
          'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-4 py-3',
          'prose-headings:text-bright prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2',
          'prose-p:my-2 prose-p:leading-relaxed prose-p:text-dim',
          'prose-a:text-teal prose-a:no-underline hover:prose-a:underline',
          'prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5',
          'prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5',
          'prose-li:my-0.5 prose-li:text-dim',
          'prose-blockquote:border-l-2 prose-blockquote:border-teal/40 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-ghost',
          'prose-code:rounded prose-code:bg-edge/40 prose-code:px-1 prose-code:text-xs',
        ].join(' '),
      },
    },
  });

  // Sync external value changes (e.g., from AI scribe)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '<p></p>');
    }
  }, [value, editor]);

  // Update editability when readOnly changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  if (!editor) {
    return (
      <div className="surface">
        <div className="skeleton h-40 rounded-card" />
      </div>
    );
  }

  return (
    <div
      className={`surface overflow-hidden ${
        isAiGenerated ? 'ring-1 ring-teal/20' : ''
      }`}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge/20">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-bright font-ui">
            {label}
          </h3>
          {isAiGenerated && (
            <span className="inline-flex items-center gap-1 text-[10px] text-teal bg-teal/10 px-1.5 py-0.5 rounded font-medium">
              <Sparkles size={9} />
              AI-assisted
            </span>
          )}
        </div>

        {!readOnly && (
          <button
            onClick={onAiGenerate}
            disabled={isGenerating}
            className="btn-ghost btn-xs gap-1 text-teal hover:text-teal"
            title={`Generate ${label} with AI`}
          >
            {isGenerating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            AI
          </button>
        )}
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-edge/10 bg-surface-alt/30">
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            icon={Bold}
            isActive={editor.isActive('bold')}
            title="Bold"
          />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            icon={Italic}
            isActive={editor.isActive('italic')}
            title="Italic"
          />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            icon={Strikethrough}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          />
          <div className="mx-1.5 h-4 w-px bg-edge/20" />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            icon={List}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            icon={ListOrdered}
            isActive={editor.isActive('orderedList')}
            title="Ordered List"
          />
          <div className="mx-1.5 h-4 w-px bg-edge/20" />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            icon={Quote}
            isActive={editor.isActive('blockquote')}
            title="Blockquote"
          />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            icon={Code}
            isActive={editor.isActive('codeBlock')}
            title="Code Block"
          />
          <div className="mx-1.5 h-4 w-px bg-edge/20" />
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            icon={Undo2}
            disabled={!editor.can().undo()}
            title="Undo"
          />
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            icon={Redo2}
            disabled={!editor.can().redo()}
            title="Redo"
          />
        </div>
      )}

      {/* Editor content */}
      <div className={`relative ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-teal text-sm bg-surface/90 px-4 py-2 rounded-lg">
              <Loader2 size={16} className="animate-spin" />
              Generating {label.toLowerCase()}...
            </div>
          </div>
        )}
        <EditorContent
          editor={editor}
          data-placeholder={placeholder}
          data-section={section}
        />
      </div>
    </div>
  );
}
