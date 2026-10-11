import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Preload for the trusted local shell only. Never attached to remote content.
 * Exposes a fixed set of named operations; no generic channel access.
 */
const PUSH = { state: 'shell:state', toast: 'shell:toast', command: 'shell:command' } as const;

const subscribe = (channel: (typeof PUSH)[keyof typeof PUSH], cb: (payload: unknown) => void) => {
  const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const str = (v: unknown) => String(v);

contextBridge.exposeInMainWorld('multiwa', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('shell:get-state'),
  addAccount: () => ipcRenderer.invoke('account:add'),
  selectAccount: (id: string) => ipcRenderer.invoke('account:select', str(id)),
  renameAccount: (id: string, name: string) => ipcRenderer.invoke('account:rename', str(id), str(name)),
  removeAccount: (id: string) => ipcRenderer.invoke('account:remove', str(id)),
  reorderAccounts: (ids: string[]) => ipcRenderer.invoke('account:reorder', Array.isArray(ids) ? ids.map(str) : []),
  accountContextMenu: (id: string) => ipcRenderer.invoke('account:context-menu', str(id)),
  reloadAccount: (id: string) => ipcRenderer.invoke('account:reload', str(id)),
  showInRightPane: (id: string) => ipcRenderer.invoke('split:show', str(id)),
  hideRightPane: () => ipcRenderer.invoke('split:hide'),
  setSplit: (ratio: number, commit: boolean) => ipcRenderer.send('layout:set-split', { ratio: Number(ratio), commit: commit === true }),
  revealDownload: (id: string) => ipcRenderer.invoke('download:reveal', str(id)),
  focusShell: () => ipcRenderer.invoke('shell:focus'),
  onState: (cb: (s: unknown) => void) => subscribe(PUSH.state, cb),
  onToast: (cb: (t: unknown) => void) => subscribe(PUSH.toast, cb),
  onCommand: (cb: (c: unknown) => void) => subscribe(PUSH.command, cb),
});
