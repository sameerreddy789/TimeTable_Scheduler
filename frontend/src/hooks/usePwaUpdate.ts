import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Detects when a new service worker is waiting and exposes a `needsRefresh` flag.
 * Also polls the server's version hash and sets `serverUpdated` when the cached
 * timetable is stale (task 11.1–11.2).
 */
export function usePwaUpdate() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      // Poll for SW updates every 60 s
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  const [serverUpdated, setServerUpdated] = useState(false);

  useEffect(() => {
    const cachedHash = localStorage.getItem('timetable_version_hash');

    async function checkVersion() {
      try {
        const res = await fetch('/api/timetable/version-hash', { credentials: 'include' });
        if (!res.ok) return;
        const { hash } = await res.json();
        if (cachedHash && hash !== cachedHash) {
          setServerUpdated(true);
        }
        localStorage.setItem('timetable_version_hash', hash);
      } catch {
        // offline — ignore
      }
    }

    checkVersion();
    const id = setInterval(checkVersion, 5 * 60_000); // every 5 min
    return () => clearInterval(id);
  }, []);

  return { needRefresh, serverUpdated, updateServiceWorker };
}
