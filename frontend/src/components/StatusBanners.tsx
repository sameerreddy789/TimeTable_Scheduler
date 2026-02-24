import { useTranslation } from 'react-i18next';
import { usePwaUpdate } from '../hooks/usePwaUpdate';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Renders:
 * - Offline banner (task 11.3)
 * - "Timetable Updated — Refresh Needed" banner (task 11.2)
 * - Reconnected notification badge (task 11.3)
 */
export function StatusBanners() {
  const { t } = useTranslation();
  const { isOnline, justReconnected } = useOnlineStatus();
  const { needRefresh, serverUpdated, updateServiceWorker } = usePwaUpdate();

  return (
    <>
      {!isOnline && (
        <div
          role="alert"
          style={{
            background: '#f59e0b',
            color: '#1c1917',
            padding: '8px 16px',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {t('offline.banner')}
        </div>
      )}

      {(needRefresh || serverUpdated) && (
        <div
          role="alert"
          style={{
            background: '#3b82f6',
            color: '#fff',
            padding: '8px 16px',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <span>{t('pwa.updateBanner')}</span>
          <button
            onClick={() => {
              localStorage.removeItem('timetable_version_hash');
              updateServiceWorker(true);
              window.location.reload();
            }}
            style={{
              background: '#fff',
              color: '#3b82f6',
              border: 'none',
              borderRadius: 4,
              padding: '2px 12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('common.refresh', 'Refresh')}
          </button>
        </div>
      )}

      {justReconnected && (
        <div
          role="status"
          style={{
            background: '#22c55e',
            color: '#fff',
            padding: '6px 16px',
            textAlign: 'center',
          }}
        >
          {t('offline.reconnected', 'Back online — checking for updates…')}
        </div>
      )}
    </>
  );
}
