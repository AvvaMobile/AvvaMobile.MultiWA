import type { MultiWAApi } from '../../shared/api';

export const api = (window as unknown as { multiwa: MultiWAApi }).multiwa;
