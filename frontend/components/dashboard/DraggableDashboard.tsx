import type { ReactElement } from "react";
import type {
  DraggableProvided,
  DraggableStateSnapshot,
  DroppableProvided,
  DroppableStateSnapshot,
  DropResult,
} from "react-beautiful-dnd";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { Bars3Icon } from "@heroicons/react/24/outline";

export interface DashboardPanel {
  id: string;
  component: ReactElement | null;
}

interface DraggableDashboardProps {
  leftPanels: DashboardPanel[];
  rightPanels: DashboardPanel[];
  onLayoutChange?: (
    leftPanels: DashboardPanel[],
    rightPanels: DashboardPanel[],
  ) => void;
}

const DroppableColumn = ({
  id,
  items,
}: {
  id: string;
  items: DashboardPanel[];
}) => (
  <Droppable droppableId={id}>
    {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
      <div
        ref={provided.innerRef}
        {...provided.droppableProps}
        className={`space-y-6 min-h-[200px] p-4 rounded-lg transition-colors duration-200 ${
          snapshot.isDraggingOver
            ? "bg-light-secondary/20 dark:bg-dark-secondary/20"
            : "bg-light-secondary/5 dark:bg-dark-secondary/5"
        }`}
      >
        {items.map((item, index) => (
          <Draggable key={item.id} draggableId={item.id} index={index}>
            {(
              provided: DraggableProvided,
              snapshot: DraggableStateSnapshot,
            ) => (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                className={`relative transition-all duration-200 ${
                  snapshot.isDragging
                    ? "opacity-75 scale-[1.02] shadow-lg"
                    : "hover:scale-[1.01]"
                }`}
              >
                <div
                  {...provided.dragHandleProps}
                  aria-label="Drag handle"
                  className="absolute top-2 right-2 p-2 rounded-lg bg-light-secondary/10 hover:bg-light-secondary/20 dark:bg-dark-secondary/10 dark:hover:bg-dark-secondary/20 cursor-grab active:cursor-grabbing transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  role="button"
                  tabIndex={0}
                  title="Drag to reorder"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      // Trigger the drag start
                      const dragEvent = new KeyboardEvent("keydown", {
                        key: " ",
                        code: "Space",
                        bubbles: true,
                      });

                      e.currentTarget.dispatchEvent(dragEvent);
                    }
                  }}
                >
                  <Bars3Icon className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
                </div>
                {item.component}
              </div>
            )}
          </Draggable>
        ))}
        {provided.placeholder}
      </div>
    )}
  </Droppable>
);

export default function DraggableDashboard({
  leftPanels: initialLeftPanels,
  rightPanels: initialRightPanels,
  onLayoutChange,
}: DraggableDashboardProps) {
  const [leftPanels, setLeftPanels] = useState<DashboardPanel[]>([]);
  const [rightPanels, setRightPanels] = useState<DashboardPanel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLayout = async () => {
      setIsLoading(true);
      try {
        // Load saved layout from localStorage
        const savedLayout = localStorage.getItem("dashboard-layout");

        if (savedLayout) {
          const { left, right } = JSON.parse(savedLayout);
          // Map saved panel IDs back to their components
          const allPanels = [...initialLeftPanels, ...initialRightPanels];
          const panelMap = new Map(allPanels.map((panel) => [panel.id, panel]));

          setLeftPanels(
            left
              .map((id: string) => panelMap.get(id))
              .filter(Boolean) as DashboardPanel[],
          );
          setRightPanels(
            right
              .map((id: string) => panelMap.get(id))
              .filter(Boolean) as DashboardPanel[],
          );
        } else {
          // If no saved layout, use initial panels
          setLeftPanels(initialLeftPanels);
          setRightPanels(initialRightPanels);
        }
      } catch (error) {
        console.error("Error loading dashboard layout:", error);
        // On error, fall back to initial panels
        setLeftPanels(initialLeftPanels);
        setRightPanels(initialRightPanels);
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, [initialLeftPanels, initialRightPanels]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    // Dropped outside a droppable area
    if (!destination) {
      return;
    }

    let newLeftPanels = leftPanels;
    let newRightPanels = rightPanels;

    // Moving within the same column
    if (source.droppableId === destination.droppableId) {
      const items = source.droppableId === "left" ? leftPanels : rightPanels;
      const reordered = Array.from(items);
      const [removed] = reordered.splice(source.index, 1);

      reordered.splice(destination.index, 0, removed);

      if (source.droppableId === "left") {
        newLeftPanels = reordered;
      } else {
        newRightPanels = reordered;
      }
    }
    // Moving between columns
    else {
      const sourceList =
        source.droppableId === "left" ? leftPanels : rightPanels;
      const destList =
        destination.droppableId === "left" ? leftPanels : rightPanels;

      const sourceClone = Array.from(sourceList);
      const destClone = Array.from(destList);
      const [removed] = sourceClone.splice(source.index, 1);

      destClone.splice(destination.index, 0, removed);

      if (source.droppableId === "left") {
        newLeftPanels = sourceClone;
        newRightPanels = destClone;
      } else {
        newRightPanels = sourceClone;
        newLeftPanels = destClone;
      }
    }

    setLeftPanels(newLeftPanels);
    setRightPanels(newRightPanels);

    // Save layout to localStorage
    const layout = {
      left: newLeftPanels.map((panel) => panel.id),
      right: newRightPanels.map((panel) => panel.id),
    };

    localStorage.setItem("dashboard-layout", JSON.stringify(layout));

    // Notify parent of layout change
    onLayoutChange?.(newLeftPanels, newRightPanels);
  };

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 bg-light-secondary/5 dark:bg-dark-secondary/5 rounded-lg flex items-center justify-center">
          <div className="animate-pulse text-light-text-secondary dark:text-dark-text-secondary">
            Loading...
          </div>
        </div>
      )}
      <DragDropContext enableDefaultSensors={true} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DroppableColumn id="left" items={leftPanels} />
          <DroppableColumn id="right" items={rightPanels} />
        </div>
      </DragDropContext>
    </div>
  );
}
