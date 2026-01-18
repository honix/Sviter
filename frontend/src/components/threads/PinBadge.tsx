/**
 * PinBadge - Reusable pin indicator with tooltip
 *
 * Used for both thread items (pin/unpin) and total count badge.
 *
 * States:
 * - Pinned: red circle with tooltip "Unpin this thread"
 * - Unpinned: transparent circle (visible on parent hover) with tooltip "Pin this thread"
 */
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PinBadgeProps {
  isPinned: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  /** Show the unpinned circle only on parent hover (default true) */
  showOnHover?: boolean;
}

export function PinBadge({
  isPinned,
  onPin,
  onUnpin,
  showOnHover = true,
}: PinBadgeProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned && onUnpin) {
      onUnpin();
    } else if (!isPinned && onPin) {
      onPin();
    }
  };

  // Stop propagation only (not preventDefault) to allow click to fire
  const stopPropagationOnly = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const circleSize = "w-3 h-3";

  if (isPinned) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            onPointerDown={stopPropagationOnly}
            onPointerUp={stopPropagationOnly}
            onMouseDown={stopPropagationOnly}
            onMouseUp={stopPropagationOnly}
            onTouchStart={stopPropagationOnly}
            onTouchEnd={stopPropagationOnly}
            className="flex items-center justify-center flex-shrink-0 cursor-pointer"
          >
            <span className={`${circleSize} bg-red-500 rounded-full shadow-sm`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          Unpin this thread
        </TooltipContent>
      </Tooltip>
    );
  }

  // Unpinned state: transparent circle that appears on hover
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onPointerDown={stopPropagationOnly}
          onPointerUp={stopPropagationOnly}
          onMouseDown={stopPropagationOnly}
          onMouseUp={stopPropagationOnly}
          onTouchStart={stopPropagationOnly}
          onTouchEnd={stopPropagationOnly}
          className={`flex items-center justify-center flex-shrink-0 cursor-pointer transition-opacity duration-150
            ${showOnHover ? "opacity-0 group-hover/item:opacity-40 hover:!opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <span className={`${circleSize} bg-muted-foreground/40 rounded-full`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        Pin this thread
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * TotalPinBadge - Badge showing total pinned count with tooltip
 */
interface TotalPinBadgeProps {
  count: number;
}

export function TotalPinBadge({ count }: TotalPinBadgeProps) {
  if (count === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center flex-shrink-0 cursor-default w-5 h-5 bg-red-500 rounded-full shadow-sm mr-1">
          <span className="text-white text-[11px] font-bold leading-none translate-y-[-0.5px]">{count}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        You have {count} pinned thread{count !== 1 ? 's' : ''}
      </TooltipContent>
    </Tooltip>
  );
}

export default PinBadge;
