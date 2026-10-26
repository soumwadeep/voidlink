import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export interface ToastMessage {
  id: number;
  title: string;
  message?: string;
  tone?: 'info' | 'warn' | 'success';
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, toast.tone === 'warn' ? 6_000 : 4_200);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`toast toast--${toast.tone ?? 'info'}`}
      role={toast.tone === 'warn' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="toast__signal" aria-hidden="true" />
      <div className="toast__copy">
        <p className="toast__title">{toast.title}</p>
        {toast.message && <p className="toast__message">{toast.message}</p>}
      </div>
      <button className="toast__close" type="button" onClick={onDismiss} aria-label="Dismiss message">
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
