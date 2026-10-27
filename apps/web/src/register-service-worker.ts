/** Registers the offline worker in production builds, once the page has loaded. */
export function registerServiceWorker(enabled: boolean = import.meta.env.PROD): void {
  if (!enabled || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is an extra: the app works without it. The reason is not logged.
      console.warn('Offline support is unavailable.');
    });
  });
}
