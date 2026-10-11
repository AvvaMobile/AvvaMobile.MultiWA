import type { ToastMessage } from '../../../shared/state';

export function Toasts({ toasts, onClick }: { toasts: ToastMessage[]; onClick(t: ToastMessage): void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => onClick(t)}>
          <b>{t.title}</b>
          {t.body && <span>{t.body}</span>}
        </button>
      ))}
    </div>
  );
}
