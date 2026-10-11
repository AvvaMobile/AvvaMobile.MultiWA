import type { CSSProperties } from 'react';
import type { AccountView } from '../../../shared/state';

export function RightPaneHeader({ account, style, onClose }: { account: AccountView; style: CSSProperties; onClose(): void }) {
  return (
    <div className="right-header" style={style}>
      <span className="tab-dot" style={{ background: account.color }} />
      <span className="right-name">{account.name}</span>
      {account.unread > 0 && <span className="tab-unread">{account.unread > 99 ? '99+' : account.unread}</span>}
      <button className="right-close" aria-label="Hide right pane" title="Hide right pane (⌘\\)" onClick={onClose}>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
      </button>
    </div>
  );
}
