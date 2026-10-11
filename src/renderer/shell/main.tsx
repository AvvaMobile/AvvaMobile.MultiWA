import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const platform = (window as unknown as { multiwa: { platform: string } }).multiwa.platform;
document.documentElement.classList.add(`platform-${platform}`);

// A file dropped on the shell chrome must not navigate the window to it.
const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
document.addEventListener('dragover', (e) => {
  if (e.defaultPrevented || !isFileDrag(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'none';
});
document.addEventListener('drop', (e) => {
  if (!e.defaultPrevented && isFileDrag(e)) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
