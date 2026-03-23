import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export default function OfflineBanner() {
  const { online, queueCount } = useNetworkStatus();

  if (online && queueCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         9999,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8,
        padding:        '8px 16px',
        background:     online ? '#854d0e' : '#1e293b',
        color:          '#fef9c3',
        fontSize:       13,
        fontWeight:     500,
        boxShadow:      '0 2px 8px rgba(0,0,0,.35)',
        transition:     'background .3s',
      }}
    >
      <span style={{ fontSize: 16 }}>{online ? '🔄' : '📴'}</span>
      {online ? (
        <>
          Reconectado — sincronizando {queueCount} acción{queueCount !== 1 ? 'es' : ''} pendiente{queueCount !== 1 ? 's' : ''}…
        </>
      ) : (
        <>
          Sin señal — modo offline activo
          {queueCount > 0 && (
            <span style={{
              background:   '#fef08a',
              color:        '#713f12',
              borderRadius: 999,
              padding:      '1px 8px',
              fontSize:     12,
              fontWeight:   700,
              marginLeft:   4,
            }}>
              {queueCount} pendiente{queueCount !== 1 ? 's' : ''}
            </span>
          )}
        </>
      )}
    </div>
  );
}
