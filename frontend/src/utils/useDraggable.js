import { useCallback, useRef, useState } from "react";

/**
 * Makes a floating (position:fixed) widget draggable by tracking a translate
 * offset applied via `transform` — the underlying bottom/right anchoring is
 * untouched, so panels anchored above the toggle move with it.
 *
 * Attach `dragHandlers` (onPointerDown/Move/Up/Cancel) to the drag handle and
 * spread `style` onto every fixed element that should move together. Check
 * `wasDragged()` inside the handle's onClick to swallow the click that fires
 * after a real drag.
 */
export const useDraggable = () => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const { px, py } = drag.current;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (!drag.current.moved && Math.hypot(dx, dy) < 5) return;
    drag.current.moved = true;
    drag.current.px = e.clientX;
    drag.current.py = e.clientY;
    setOffset((prev) => {
      // Anchored bottom-right: negative moves left/up. Clamp so the widget
      // can't be dragged fully off-screen in any direction.
      const minX = -(window.innerWidth - 80);
      const minY = -(window.innerHeight - 80);
      return {
        x: Math.min(24, Math.max(minX, prev.x + dx)),
        y: Math.min(24, Math.max(minY, prev.y + dy)),
      };
    });
  }, []);

  const endDrag = useCallback(() => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  }, []);

  const wasDragged = useCallback(() => {
    const dragged = suppressClick.current;
    suppressClick.current = false;
    return dragged;
  }, []);

  return {
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    wasDragged,
  };
};

export default useDraggable;
