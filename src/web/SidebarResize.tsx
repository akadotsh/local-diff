import React, { useLayoutEffect, useRef, useState } from "react";

export function SidebarResize() {
  const handle = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem("rex-review-sidebar-width"));
    return Number.isFinite(saved) && saved >= 200 ? Math.min(520, saved) : 248;
  });
  useLayoutEffect(() => {
    handle.current?.parentElement?.style.setProperty("--sidebar-preferred-width", `${width}px`);
  }, [width]);
  function resize(value: number, save = false) {
    const layout = handle.current?.parentElement;
    if (!layout) return;
    const next = Math.round(Math.max(200, Math.min(520, layout.clientWidth / 2, value)));
    layout.dataset.sidebarMotion = "false";
    setWidth(next);
    if (save) localStorage.setItem("rex-review-sidebar-width", String(next));
  }
  return <div
    ref={handle}
    className="sidebar-resize"
    role="separator"
    aria-label="Resize sidebar"
    aria-orientation="vertical"
    aria-valuemin={200}
    aria-valuemax={520}
    aria-valuenow={width}
    tabIndex={0}
    data-dragging={dragging}
    title="Drag to resize · Double-click to reset"
    onPointerDown={event => {
      if (event.button !== 0 || pointer.current !== undefined) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={event => {
      if (pointer.current !== event.pointerId) return;
      const layout = event.currentTarget.parentElement!;
      const bounds = layout.getBoundingClientRect();
      resize(layout.classList.contains("sidebar-right") ? bounds.right - event.clientX : event.clientX - bounds.left);
    }}
    onPointerUp={event => {
      if (pointer.current === event.pointerId) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onLostPointerCapture={() => {
      pointer.current = undefined;
      setDragging(false);
      localStorage.setItem("rex-review-sidebar-width", String(width));
    }}
    onDoubleClick={() => resize(248, true)}
    onKeyDown={event => {
      const right = handle.current?.parentElement?.classList.contains("sidebar-right");
      const next = {
        ArrowLeft: width + (right ? 16 : -16),
        ArrowRight: width + (right ? -16 : 16),
        Home: 200,
        End: 520,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      resize(next, true);
    }}
  />;
}
