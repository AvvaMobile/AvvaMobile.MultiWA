import { useCallback, useEffect, useRef, useState } from 'react';
import { computeSplitGeometry, ratioFromPointer, type Rect } from '../../domain/layout/splitPane';
import type { MultiWAApi } from '../../shared/api';
import { RIGHT_PANE_HEADER_HEIGHT, workAreaFor } from '../../shared/shellLayout';
import type { ShellState, ToastMessage } from '../../shared/state';
import { OfflinePage } from './components/OfflinePage';
import { RightPaneHeader } from './components/RightPaneHeader';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';

const EMPTY: ShellState = { accounts: [], activeAccountId: null, rightPaneAccountId: null, splitRatio: 0.5 };

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

const rectStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function App({ api }: { api: MultiWAApi }) {
  const [state, setState] = useState<ShellState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const size = useWindowSize();
  // Read by the long-lived command listener without re-subscribing on every tab switch.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = state.activeAccountId;

  const active = state.accounts.find((a) => a.id === state.activeAccountId) ?? null;
  const right = state.accounts.find((a) => a.id === state.rightPaneAccountId) ?? null;

  const toast = useCallback((t: ToastMessage) => {
    setToasts((ts) => [...ts.slice(-3), t]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), t.kind === 'error' ? 12_000 : 8_000);
  }, []);

  useEffect(() => {
    const offs = [
      api.onState((s) => setState(s)),
      api.onToast((t) => toast(t)),
      api.onCommand((c) => {
        if (c === 'fullscreen-enter') setFullscreen(true);
        if (c === 'fullscreen-leave') setFullscreen(false);
        if (c === 'rename-active') setRenamingId((cur) => cur ?? activeIdRef.current);
        if (typeof c === 'object' && c.type === 'rename') setRenamingId(c.id);
      }),
    ];
    void api.getState().then((s) => {
      setState(s);
      setLoaded(true);
    });
    return () => offs.forEach((o) => o());
  }, [api, toast]);

  // A rename of a tab that disappeared (removed / moved to another window) ends.
  useEffect(() => {
    if (renamingId && !state.accounts.some((a) => a.id === renamingId)) setRenamingId(null);
  }, [state.accounts, renamingId]);

  // ---------- Geometry (shared with main) ----------
  const area = workAreaFor(size.w, size.h);
  const ratio = dragRatio ?? state.splitRatio;
  const split = right ? computeSplitGeometry(area, ratio) : null;
  const leftRect = split ? split.left : area;
  const rightHeaderRect = split ? { ...split.right, height: Math.min(RIGHT_PANE_HEADER_HEIGHT, split.right.height) } : null;
  const rightRect = split ? { ...split.right, y: split.right.y + rightHeaderRect!.height, height: split.right.height - rightHeaderRect!.height } : null;

  useEffect(() => setDragRatio(null), [state.rightPaneAccountId, state.splitRatio]);

  const dragging = useRef(false);
  const frame = useRef(0);
  const latest = useRef(ratio);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('resizing');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const r = ratioFromPointer(e.clientX - area.x, area.width);
    latest.current = r;
    setDragRatio(r);
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        api.setSplit(latest.current, false);
      });
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    document.documentElement.classList.remove('resizing');
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    api.setSplit(latest.current, true);
  };

  if (!loaded) return <div className="boot" />;

  return (
    <div className={`shell ${fullscreen ? 'fullscreen' : ''}`}>
      <TabBar
        accounts={state.accounts}
        activeId={state.activeAccountId}
        onSelect={(id) => void api.selectAccount(id)}
        onReorder={(ids) => {
          // Optimistic: show the new order immediately; main broadcasts the persisted order.
          setState((s) => ({ ...s, accounts: ids.map((id) => s.accounts.find((a) => a.id === id)!).filter(Boolean) }));
          void api.reorderAccounts(ids);
        }}
        onContextMenu={(id) => void api.accountContextMenu(id)}
        onNew={() => void api.addAccount()}
        onClose={(id) => void api.removeAccount(id)}
        renamingId={renamingId}
        onRenameStart={setRenamingId}
        onRename={(id, name) => {
          setRenamingId(null);
          void api.renameAccount(id, name).then((r) => {
            if (!r.ok) toast({ id: `${Date.now()}`, accountId: id, kind: 'error', title: 'Name not changed', body: r.detail ?? '' });
          });
        }}
        onRenameEnd={() => setRenamingId(null)}
        trailing={
          <Toasts
            toasts={toasts}
            onClick={(t) => {
              if (t.downloadId) void api.revealDownload(t.downloadId);
              else if (t.accountId) void api.selectAccount(t.accountId);
              setToasts((ts) => ts.filter((x) => x.id !== t.id));
            }}
          />
        }
      />

      {active ? (
        <>
          {active.status !== 'ready' && <div className="pane-placeholder" style={rectStyle(leftRect)}>{active.status === 'loading' ? 'Loading WhatsApp…' : ''}</div>}
          {active.status === 'offline' && <OfflinePage account={active} style={rectStyle(leftRect)} onReload={() => void api.reloadAccount(active.id)} />}
        </>
      ) : (
        <div className="pane-placeholder empty" style={rectStyle(area)}>
          <div>
            <h2>No accounts yet</h2>
            <p className="muted">Click + to add a WhatsApp account. Each tab is a separate WhatsApp Web session.</p>
            <button className="btn primary" onClick={() => void api.addAccount()}>Add account</button>
          </div>
        </div>
      )}

      {split && right && rightHeaderRect && rightRect && (
        <>
          <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize panes" style={rectStyle(split.splitter)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          <RightPaneHeader account={right} style={rectStyle(rightHeaderRect)} onClose={() => void api.hideRightPane()} />
          {right.status !== 'ready' && <div className="pane-placeholder" style={rectStyle(rightRect)}>{right.status === 'loading' ? 'Loading WhatsApp…' : ''}</div>}
          {right.status === 'offline' && <OfflinePage account={right} style={rectStyle(rightRect)} onReload={() => void api.reloadAccount(right.id)} />}
        </>
      )}

    </div>
  );
}
