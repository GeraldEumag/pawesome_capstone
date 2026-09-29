import React, { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import "./RowActionPopover.css";

const getTextContent = (node) => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(getTextContent).join(" ");
};

const actionLabel = (element) =>
  element.props["aria-label"] || element.props.title || getTextContent(element.props.children).trim() || "Action";

const renderPopoverChildren = (children, inLabel = false, onAction = () => {}, keyPath = "row-action") =>
  React.Children.toArray(children).flatMap((node, index) => {
    const key = `${keyPath}-${index}`;
    if (!isValidElement(node)) return [node];
    if (node.type === React.Fragment) return renderPopoverChildren(node.props.children, inLabel, onAction, key);

    if (node.type === "button") {
      const label = actionLabel(node);
      const originalClick = node.props.onClick;
      const content = getTextContent(node.props.children).trim()
        ? renderPopoverChildren(node.props.children, false, onAction, key)
        : <><span className="row-action-popover-icon">{node.props.children}</span><span>{label}</span></>;
      return [cloneElement(node, {
        key,
        type: "button",
        className: [node.props.className, "row-action-popover-item"].filter(Boolean).join(" "),
        "aria-label": node.props["aria-label"] || label,
        onClick: (event) => {
          event.stopPropagation();
          try {
            originalClick?.(event);
          } finally {
            onAction();
          }
        },
      }, content)];
    }

    if (node.type === "div") return renderPopoverChildren(node.props.children, inLabel, onAction, key);

    if (node.type === "input" && node.props.type === "checkbox" && !inLabel) {
      const label = node.props["aria-label"] || node.props.title || "Select row";
      return [
        <label className="row-action-popover-checkbox" key={key}>
          {cloneElement(node, { "aria-label": label })}
          <span>{label}</span>
        </label>,
      ];
    }

    if (node.type === "select" && !inLabel) {
      const label = node.props["aria-label"] || node.props.title || "Choose option";
      return [
        <label className="row-action-popover-control" key={key}>
          <span>{label}</span>
          {cloneElement(node, { "aria-label": label })}
        </label>,
      ];
    }

    const nestedChildren = node.props.children !== undefined
      ? renderPopoverChildren(node.props.children, inLabel || node.type === "label", onAction, key)
      : node.props.children;
    return [cloneElement(node, { key }, nestedChildren)];
  });

const RowActionPopover = ({ children, rowLabel = "row actions", className = "" }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const popoverId = useId();
  const content = renderPopoverChildren(children, false, () => setOpen(false));
  const hasContent = content.some((child) => {
    if (child === null || child === undefined || child === false) return false;
    if (typeof child === "string") return child.trim().length > 0;
    return true;
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 240;
    const panelHeight = panel.offsetHeight || 160;
    const gap = 6;
    const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
    const below = rect.bottom + gap;
    const top = below + panelHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - panelHeight - gap);

    setPosition({ top, left, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector("button:not(:disabled), input:not(:disabled), select:not(:disabled)")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!hasContent) return null;

  return (
    <span className={`row-action-popover ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="row-action-popover-trigger"
        aria-label={`Actions for ${rowLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title="More actions"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <FontAwesomeIcon icon={faEllipsis} />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id={popoverId}
          role="dialog"
          aria-label={`Actions for ${rowLabel}`}
          className="row-action-popover-panel"
          style={{ top: position.top, left: position.left, visibility: position.ready ? "visible" : "hidden" }}
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  );
};

export default RowActionPopover;
