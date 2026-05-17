import { clsx } from 'clsx';

const VARIANTS = {
  default: {
    border:     'var(--color-border)',
    iconBg:     'var(--color-surface-2)',
    iconColor:  'var(--color-text-2)',
  },
  success: {
    border:     'var(--color-success)',
    iconBg:     'var(--color-success-bg)',
    iconColor:  'var(--color-success)',
  },
  error: {
    border:     'var(--color-error)',
    iconBg:     'var(--color-error-bg)',
    iconColor:  'var(--color-error)',
  },
  warning: {
    border:     'var(--color-warning)',
    iconBg:     'var(--color-warning-bg)',
    iconColor:  'var(--color-warning)',
  },
  primary: {
    border:     'var(--color-primary)',
    iconBg:     'var(--color-primary-bg)',
    iconColor:  'var(--color-primary)',
  },
};

export function SummaryCard({
  title, value, subtitle, icon: Icon,
  variant = 'default', mono = false,
}) {
  const v = VARIANTS[variant] || VARIANTS.default;

  return (
    <div style={{
      background:   'var(--color-surface)',
      border:       `1px solid var(--color-border)`,
      borderRadius: 'var(--radius-lg)',
      padding:      'var(--space-5)',
      display:      'flex',
      flexDirection:'column',
      gap:          'var(--space-3)',
      transition:   'all var(--transition-normal)',
      cursor:       'default',
      position:     'relative',
      overflow:     'hidden',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = v.border;
      e.currentTarget.style.boxShadow   = 'var(--shadow-md)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--color-border)';
      e.currentTarget.style.boxShadow   = 'none';
    }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize:   'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color:      'var(--color-text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {title}
        </span>
        {Icon && (
          <div style={{
            width: 34, height: 34,
            background:   v.iconBg,
            borderRadius: 'var(--radius-md)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}>
            <Icon size={16} color={v.iconColor} />
          </div>
        )}
      </div>

      {/* Valor */}
      <div style={{
        fontSize:   'var(--text-xl)',
        fontWeight: 'var(--weight-bold)',
        color:      'var(--color-text)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        lineHeight: 1.2,
      }}>
        {value ?? '—'}
      </div>

      {/* Subtítulo */}
      {subtitle && (
        <div style={{
          fontSize: 'var(--text-sm)',
          color:    'var(--color-text-3)',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
