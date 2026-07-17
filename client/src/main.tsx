import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/index.css';

if (import.meta.env.DEV) {
  void import('react-grab');
  void import('react-scan').then((mod) => {
    mod.scan({ enabled: true });
  });
}

const root = document.querySelector('#app');
if (!root) {
  throw new Error('App root was not found.');
}

// Avoid StrictMode double-mount for WebSocket room creation.
createRoot(root).render(<App />);

registerServiceWorker();

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Online play still works without PWA caching.
    });
  });
}
