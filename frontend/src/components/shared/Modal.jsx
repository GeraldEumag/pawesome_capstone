import React, { useEffect, useId, useRef } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "./Modal.css";

/**
 * Canonical shared modal. Renders through a React portal on document.body
 * so `position: fixed` is never trapped by a transformed/animated ancestor
 * (e.g. cards using `animation-fill-mode: both`).
 *
 * Usage:
 *   <Modal isOpen={open} onClose={close} title="Title" subtitle="..." icon={faX}>
 *     body
 *   </Modal>
 */
const Modal = ({
  isOpen = true,
  onClose,
  title,
  subtitle,
  icon,
  size = "md", // sm | md | lg | xl
  footer,
  headerActions,
  children,
  className = "",
  closeOnBackdrop = true,
  showClose = true,
  headerless = false,
}) => {
  const titleId = useId();
  const modalRef = useRef(null);
  // onClose is typically a fresh inline function each parent render. Keep it in
  // a ref so this effect only re-runs when isOpen toggles — otherwise every
  // keystroke inside the modal re-fires el.focus() and steals input focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    el?.focus();

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    const onKey = (e) => {
      if (e.key === "Escape") {
        // Let an open react-datepicker consume Escape first — closing the
        // modal while picking a date inside it is a data-loss trap.
        if (document.querySelector(".react-datepicker__portal")) return;
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusable = el.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="pw-modal-overlay"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={modalRef}
        className={`pw-modal pw-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !headerless ? titleId : undefined}
        tabIndex={-1}
      >
        {!headerless && (
          <div className="pw-modal-header">
            {icon && (
              <span className="pw-modal-icon">
                {React.isValidElement(icon) ? icon : <FontAwesomeIcon icon={icon} />}
              </span>
            )}
            <div className="pw-modal-titles">
              {title && <h2 id={titleId} className="pw-modal-title">{title}</h2>}
              {subtitle && <p className="pw-modal-subtitle">{subtitle}</p>}
            </div>
            {headerActions}
            {showClose && onClose && (
              <button
                type="button"
                className="pw-modal-close"
                onClick={onClose}
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        )}
        <div className="pw-modal-body">{children}</div>
        {footer && <div className="pw-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
