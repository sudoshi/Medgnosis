'use client';

import {
  forwardRef,
  useRef,
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

interface Position {
  x: number;
  y: number;
}

interface SortableContextValue<T extends { id: string }> {
  items: T[];
  activeId: string | null;
  overIndex: number;
  onDragStart: (id: string, event: React.PointerEvent) => void;
  onDragEnd: () => void;
  onDragOver: (index: number) => void;
}

const SortableContext = createContext<SortableContextValue<any> | null>(null);

export interface SortableProps<T extends { id: string }> {
  items: T[];
  onChange: (items: T[]) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Sortable<T extends { id: string }>({
  items,
  onChange,
  children,
  className,
  disabled = false,
}: SortableProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number>(-1);
  const [initialPosition, setInitialPosition] = useState<Position | null>(null);
  const [translation, setTranslation] = useState<Position>({ x: 0, y: 0 });

  const dragStartPosition = useRef<Position | null>(null);
  const dragElement = useRef<HTMLElement | null>(null);

  const handleDragStart = useCallback((id: string, event: React.PointerEvent) => {
    if (disabled) return;

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();

    setActiveId(id);
    setInitialPosition({ x: rect.left, y: rect.top });
    dragStartPosition.current = { x: event.clientX, y: event.clientY };
    dragElement.current = element;

    element.style.opacity = '0';
  }, [disabled]);

  const handleDragEnd = useCallback(() => {
    if (!activeId) return;

    const oldIndex = items.findIndex(item => item.id === activeId);
    if (overIndex !== -1 && oldIndex !== overIndex) {
      const newItems = [...items];
      const [removed] = newItems.splice(oldIndex, 1);
      newItems.splice(overIndex, 0, removed);
      onChange(newItems);
    }

    if (dragElement.current) {
      dragElement.current.style.opacity = '1';
    }

    setActiveId(null);
    setOverIndex(-1);
    setInitialPosition(null);
    setTranslation({ x: 0, y: 0 });
    dragStartPosition.current = null;
    dragElement.current = null;
  }, [activeId, items, overIndex, onChange]);

  const handleDragOver = useCallback((index: number) => {
    if (activeId) {
      setOverIndex(index);
    }
  }, [activeId]);

    useEffect(() => {
    if (!activeId) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStartPosition.current) return;

      const dx = event.clientX - dragStartPosition.current.x;
      const dy = event.clientY - dragStartPosition.current.y;

      setTranslation({ x: dx, y: dy });
    };

    const handlePointerUp = () => {
      handleDragEnd();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeId, handleDragEnd]);

  return (
    <SortableContext.Provider
      value={{
        items,
        activeId,
        overIndex,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        onDragOver: handleDragOver,
      }}
    >
      <div className={cn('relative', className)}>
        {children}
        {activeId && initialPosition && createPortal(
          <div
            style={{
              position: 'fixed',
              left: initialPosition.x + translation.x,
              top: initialPosition.y + translation.y,
              width: dragElement.current?.offsetWidth,
              height: dragElement.current?.offsetHeight,
              pointerEvents: 'none',
              zIndex: 50,
              opacity: 0.8,
              transform: 'rotate(3deg)',
            }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: dragElement.current?.outerHTML || '',
              }}
            />
          </div>,
          document.body
        )}
      </div>
    </SortableContext.Provider>
  );
}

// Props for each sortable item
export interface SortableItemProps {
  id: string;
  index: number;
  children: React.ReactNode;
  className?: string;
  dragHandleClassName?: string;
}

// Update SortableItem to use SortableItemProps<T> and get context type from SortableContext
export const SortableItem = forwardRef<HTMLDivElement, SortableItemProps>(
  ({ id, index, children, className, dragHandleClassName }, ref) => {
    const context = useContext(SortableContext) as SortableContextValue<any>;
    if (!context) {
      throw new Error('SortableItem must be used within a Sortable');
    }

    const { overIndex, onDragStart, onDragOver } = context;
    const isOver = overIndex === index;

    return (
      <div
        ref={ref}
        className={cn(
          'relative touch-none',
          isOver && 'opacity-50',
          className
        )}
        onPointerEnter={() => onDragOver(index)}
      >
        <div className={cn('absolute inset-0 cursor-move', dragHandleClassName)} onPointerDown={(e) => onDragStart(id, e)} />
        {children}
      </div>
    );
  }
);

SortableItem.displayName = 'SortableItem';
