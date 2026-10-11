import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('multiwa', { platform: process.platform });
