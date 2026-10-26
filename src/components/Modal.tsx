import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  dismissible?: boolean;
}

let scrollLocks = 0;

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.classList.remove('is-locked');
}

export function Modal({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
  dismissible = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
      scrollLocks += 1;
      document.body.classList.add('is-locked');
    }
    return () => {
      if (dialog.open) dialog.close();
      unlockScroll();
    };
  }, [open]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`modal ${className}`.trim()}
      aria-labelledby={labelledBy}
      onCancel={event => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={event => {
        if (!dismissible) return;
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal__panel">{children}</div>
    </dialog>,
    document.body,
  );
}
