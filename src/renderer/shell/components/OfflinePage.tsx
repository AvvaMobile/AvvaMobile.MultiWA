import type { CSSProperties } from 'react';
import type { AccountView } from '../../../shared/state';

/** Drawn over an account's pane while its view is offline (the view itself is hidden by main). */
export function OfflinePage({ account, style, onReload }: { account: AccountView; style: CSSProperties; onReload(): void }) {
  return (
    <div className="offline" style={style} role="alert">
      <div className="offline-inner">
        <h2>{account.name} is offline</h2>
        <p className="muted">{account.error ?? 'WhatsApp Web could not be loaded.'}</p>
        <button className="btn primary" onClick={onReload}>Reload</button>
      </div>
    </div>
  );
}
