import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

const ICONS = {
  warning: AlertTriangle,
  info:    Info,
  success: CheckCircle,
  error:   XCircle,
};

const COLORS = {
  warning: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: 'var(--color-warning)' },
  info:    { bg: 'var(--color-info-bg)',    border: 'var(--color-info)',    text: 'var(--color-info)'    },
  success: { bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: 'var(--color-success)' },
  error:   { bg: 'var(--color-error-bg)',   border: 'var(--color-error)',   text: 'var(--color-error)'   },
};

export function AlertCard({ tipo = 'info', titulo, descricao }) {
  const Icon = ICONS[tipo];
  const c    = COLORS[tipo];

  return (
    <div style={{
      background:   c.bg,
      border:       `1px solid ${c.border}`,
      borderRadius: 'var(--radius-md)',
      padding:      'var(--space-3) var(--space-4)',
      display:      'flex',
      gap:          'var(--space-3)',
      alignItems:   'flex-start',
    }}>
      <Icon size={16} color={c.text} style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{
          fontSize:   'var(--text-base)',
          fontWeight: 'var(--weight-medium)',
          color:      c.text,
        }}>
          {titulo}
        </div>
        {descricao && (
          <div style={{
            fontSize: 'var(--text-sm)',
            color:    'var(--color-text-2)',
            marginTop: 'var(--space-1)',
          }}>
            {descricao}
          </div>
        )}
      </div>
    </div>
  );
}
