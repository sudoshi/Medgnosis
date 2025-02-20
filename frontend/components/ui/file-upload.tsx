'use client';

import { ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRef, useState, useCallback } from 'react';

import { cn } from '@/lib/utils';

export interface FileUploadProps {
  accept?: string;
  maxSize?: number; // in bytes
  maxFiles?: number;
  multiple?: boolean;
  onFilesSelected?: (files: File[]) => void;
  onError?: (error: string) => void;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  helperText?: string;
  error?: boolean;
}

export function FileUpload({
  accept,
  maxSize,
  maxFiles = 1,
  multiple = false,
  onFilesSelected,
  onError,
  className,
  disabled = false,
  loading = false,
  helperText,
  error = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !loading) {
      setIsDragging(true);
    }
  }, [disabled, loading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFiles = useCallback((files: File[]): string | null => {
    if (maxFiles && files.length > maxFiles) {
      return `Maximum ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed`;
    }

    if (maxSize) {
      const oversizedFiles = files.filter(file => file.size > maxSize);
      if (oversizedFiles.length > 0) {
        return `File${oversizedFiles.length === 1 ? '' : 's'} exceed${oversizedFiles.length === 1 ? 's' : ''} maximum size of ${formatBytes(maxSize)}`;
      }
    }

    if (accept) {
      const invalidFiles = files.filter(file => {
        const fileType = file.type || '';
        const fileExtension = `.${file.name.split('.').pop()}`;
        const acceptedTypes = accept.split(',').map(type => type.trim());
        return !acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExtension.toLowerCase() === type.toLowerCase();
          }
          if (type.includes('/*')) {
            const [mainType] = type.split('/');
            return fileType.startsWith(`${mainType}/`);
          }
          return fileType === type;
        });
      });

      if (invalidFiles.length > 0) {
        return `Invalid file type${invalidFiles.length === 1 ? '' : 's'}`;
      }
    }

    return null;
  }, [maxFiles, maxSize, accept]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const error = validateFiles(fileArray);

    if (error) {
      onError?.(error);
      return;
    }

    setSelectedFiles(prev => {
      const newFiles = multiple ? [...prev, ...fileArray] : fileArray;
      onFilesSelected?.(newFiles);
      return newFiles;
    });
  }, [multiple, validateFiles, onFilesSelected, onError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || loading) return;
    handleFiles(e.dataTransfer.files);
  }, [disabled, loading, handleFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  }, [handleFiles]);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      onFilesSelected?.(newFiles);
      return newFiles;
    });
  }, [onFilesSelected]);

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed border-dark-border p-6 transition-colors',
          isDragging && 'border-accent-primary bg-accent-primary/5',
          disabled && 'cursor-not-allowed opacity-60',
          error && 'border-accent-error',
          className
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleFileInputChange}
          disabled={disabled || loading}
        />

        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="rounded-full bg-dark-secondary p-3">
            <ArrowUpTrayIcon className="h-6 w-6 text-dark-text-secondary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {loading ? (
                'Uploading...'
              ) : (
                <>
                  Drag & drop files here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-accent-primary hover:underline"
                    disabled={disabled || loading}
                  >
                    browse
                  </button>
                </>
              )}
            </p>
            {accept && (
              <p className="text-xs text-dark-text-secondary">
                Accepted file types: {accept}
              </p>
            )}
            {maxSize && (
              <p className="text-xs text-dark-text-secondary">
                Maximum file size: {formatBytes(maxSize)}
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-dark-secondary/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-border border-t-accent-primary" />
          </div>
        )}
      </div>

      {selectedFiles.length > 0 && (
        <ul className="space-y-2">
          {selectedFiles.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-lg bg-dark-secondary p-2 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="ml-2 rounded-full p-1 hover:bg-dark-border"
                disabled={disabled || loading}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {helperText && (
        <p
          className={cn(
            'text-sm',
            error ? 'text-accent-error' : 'text-dark-text-secondary'
          )}
        >
          {helperText}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
