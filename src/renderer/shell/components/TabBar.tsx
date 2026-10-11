import { useEffect, useRef, useState } from 'react';
import type { AccountView } from '../../../shared/state';

interface Props {
  accounts: AccountView[];
  activeId: string | null;
  onSelect(id: string): void;
  /** Called with the full new order after a drag-and-drop move. */
  onReorder(ids: string[]): void;
  /** Right-click: native per-account menu (main process). */
  onContextMenu(id: string): void;
  /** `+`: a new account tab opens WhatsApp Web right away. */
  onNew(): void;
  /** Closing a tab removes the account (main asks for confirmation). */
  onClose(id: string): void;
  /** Inline rename (double-click or File → Rename). */
  renamingId: string | null;
  onRenameStart(id: string): void;
  onRename(id: string, name: string): void;
  onRenameEnd(): void;
}

/** Pointer travel before a press becomes a drag (a shorter press is a click). */
const DRAG_THRESHOLD = 4;
const DROP_MS = 150;

interface Drag {
  id: string;
  from: number;
  startX: number;
  dx: number;
  /** Distance between two tab slots (tab width + gap), measured at drag start. */
  slot: number;
  active: boolean;
  dropping: boolean;
}

/** Index the dragged tab would land on for a horizontal offset. */
export function targetIndex(from: number, dx: number, slot: number, count: number): number {
  return Math.max(0, Math.min(count - 1, from + Math.round(dx / slot)));
}

/** Offset for a non-dragged tab at `index` while the dragged one moves from `from` to `to`. */
export function shiftFor(index: number, from: number, to: number, slot: number): number {
  if (from < to && index > from && index <= to) return -slot;
  if (from > to && index >= to && index < from) return slot;
  return 0;
}

function RenameInput({ initial, onCommit, onCancel }: { initial: string; onCommit(name: string): void; onCancel(): void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name && name !== initial) onCommit(name);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className="tab-rename"
      value={value}
      maxLength={40}
      aria-label="Account name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Browser-style account tab strip (Sidekick's tab bar). Tabs are reordered by dragging: the other tabs slide
 * out of the way, the dragged tab settles on release. Double-click renames in place.
 */
export function TabBar({ accounts, activeId, onSelect, onReorder, onContextMenu, onNew, onClose, renamingId, onRenameStart, onRename, onRenameEnd }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const to = drag ? targetIndex(drag.from, drag.dx, drag.slot, accounts.length) : -1;

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, id: string, index: number) => {
    if (e.button !== 0 || dragRef.current || renamingId === id) return;
    const list = e.currentTarget.parentElement!;
    const items = list.querySelectorAll<HTMLElement>('.tab');
    const slot = items.length > 1 ? items[1]!.offsetLeft - items[0]!.offsetLeft : e.currentTarget.offsetWidth + 4;
    e.currentTarget.setPointerCapture(e.pointerId);
    update({ id, from: index, startX: e.clientX, dx: 0, slot, active: false, dropping: false });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.dropping) return;
    const dx = e.clientX - d.startX;
    if (!d.active && Math.abs(dx) < DRAG_THRESHOLD) return;
    update({ ...d, dx, active: true });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>, id: string) => {
    const d = dragRef.current;
    if (!d || d.dropping) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.active) {
      update(null);
      onSelect(id);
      return;
    }
    const dest = targetIndex(d.from, d.dx, d.slot, accounts.length);
    update({ ...d, dx: (dest - d.from) * d.slot, dropping: true });
    window.setTimeout(() => {
      if (dest !== d.from) {
        const ids = accounts.map((a) => a.id).filter((x) => x !== d.id);
        ids.splice(dest, 0, d.id);
        onReorder(ids);
      }
      update(null);
    }, DROP_MS);
  };

  const isMac = /Mac/i.test(navigator.platform);

  return (
    <header className="topbar">
      <nav className="tabs" aria-label="Accounts" role="tablist">
        <div className={`tab-list ${drag?.active ? 'reordering' : ''}`}>
          {accounts.map((a, index) => {
            const active = a.id === activeId;
            const isDragged = drag?.active && drag.id === a.id;
            let transform = '';
            if (drag?.active) transform = isDragged ? `translateX(${drag.dx}px) scale(${drag.dropping ? 1 : 1.03})` : `translateX(${shiftFor(index, drag.from, to, drag.slot)}px)`;
            const statusTitle = a.status === 'offline' ? ` — offline${a.error ? `: ${a.error}` : ''}` : a.status === 'loading' ? ' — loading' : '';
            return (
              <div
                key={a.id}
                role="tab"
                tabIndex={0}
                className={`tab ${active ? 'active' : ''} ${a.status} ${isDragged ? 'dragging' : ''} ${isDragged && drag.dropping ? 'dropping' : ''}`}
                style={{ transform: transform || undefined }}
                title={`${a.name}${statusTitle}`}
                aria-selected={active}
                onPointerDown={(e) => onPointerDown(e, a.id, index)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, a.id)}
                onPointerCancel={() => update(null)}
                onDoubleClick={() => onRenameStart(a.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!dragRef.current?.active) onContextMenu(a.id);
                }}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) onSelect(a.id);
                }}
              >
                <span className="tab-dot" style={{ background: a.color }} />
                {renamingId === a.id ? (
                  <RenameInput initial={a.name} onCommit={(name) => onRename(a.id, name)} onCancel={onRenameEnd} />
                ) : (
                  <span className="tab-name">{a.name}</span>
                )}
                {a.status === 'loading' && <span className="tab-badge loading" aria-hidden="true" />}
                {a.status === 'offline' && <span className="tab-badge offline" aria-label="Offline" />}
                {a.unread > 0 && a.status !== 'offline' && <span className="tab-unread" aria-label={`${a.unread} unread`}>{a.unread > 99 ? '99+' : a.unread}</span>}
                <button
                  className="tab-close"
                  aria-label={`Close ${a.name}`}
                  title="Remove account"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(a.id);
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
                </button>
              </div>
            );
          })}
          <button className="tab-add" title={`New Account (${isMac ? '⌘T' : 'Ctrl+T'})`} aria-label="New Account" onClick={onNew}>
            +
          </button>
        </div>
      </nav>
    </header>
  );
}
