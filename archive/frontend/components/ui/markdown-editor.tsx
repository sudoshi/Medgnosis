'use client';

import { forwardRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypePrism from 'rehype-prism-plus';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { cn } from '@/lib/utils';
import 'katex/dist/katex.min.css';

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  previewClassName?: string;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
  showPreview?: boolean;
  previewOnly?: boolean;
}

export const MarkdownEditor = forwardRef<HTMLDivElement, MarkdownEditorProps>(
  ({
    value,
    onChange,
    className,
    previewClassName,
    placeholder = 'Write markdown here...',
    readOnly = false,
    minHeight = 200,
    maxHeight,
    showPreview = true,
    previewOnly = false,
  }, ref) => {
    const [isPreviewVisible, setIsPreviewVisible] = useState(showPreview);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value);
    }, [onChange]);

    const togglePreview = useCallback(() => {
      if (!previewOnly) {
        setIsPreviewVisible(prev => !prev);
      }
    }, [previewOnly]);

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border border-dark-border bg-dark-secondary',
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-dark-border p-2">
          <div className="flex items-center gap-2">
            {!previewOnly && (
              <button
                type="button"
                onClick={togglePreview}
                className={cn(
                  'rounded-md px-2 py-1 text-sm font-medium',
                  'hover:bg-dark-border hover:text-dark-text-primary',
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                  isPreviewVisible && 'bg-dark-border text-dark-text-primary'
                )}
              >
                {isPreviewVisible ? 'Edit' : 'Preview'}
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          {!previewOnly && !isPreviewVisible && (
            <textarea
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              readOnly={readOnly}
              className={cn(
                'w-full resize-none rounded-b-md bg-transparent p-4 text-sm',
                'placeholder:text-dark-text-secondary',
                'focus:outline-none',
                readOnly && 'cursor-not-allowed opacity-50'
              )}
              style={{
                minHeight,
                maxHeight,
                height: 'auto',
              }}
            />
          )}
          {(isPreviewVisible || previewOnly) && (
            <div
              className={cn(
                'prose prose-invert max-w-none rounded-b-md p-4',
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
                'prose-td:border prose-td:border-dark-border prose-td:p-2',
                previewClassName
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypePrism]}
              >
                {value || '*No content*'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }
);
MarkdownEditor.displayName = 'MarkdownEditor';
