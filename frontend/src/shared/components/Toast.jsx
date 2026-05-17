import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export function Toast({ mensagem, tipo = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const cor = tipo === 'success' ? 'var(--color-success)' : 'var(--color-error)';
  const bg  = tipo === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)';
  const Icon = tipo === 'success' ? CheckCircle : XCircle;

  return (
    <div style={{
      position:     'fixed',
      bottom:       'var(--space-6)',
      right:        'var(--space-6)',
      zIndex:       1000,
      background:   'var(--color-surface)',
      border:       `1px solid ${cor}`,
      borderRadius: 'var(--radius-md)',
      padding:      'var(--space-3) var(--space-4)',
      display:      'flex',
      alignItems:   'center',
      gap:          'var(--space-3)',
      boxShadow:    'var(--shadow-lg)',
      maxWidth:     360,
      animation:    'slideIn 200ms ease',
    }}>
      <Icon size={16} color={cor} />
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', flex: 1 }}>
        {mensagem}
      </span>
      <button onClick={onClose} className="btn-icon" style={{ padding: 'var(--space-1)' }}>
        <X size={14} />
      </button>
    </div>
  );
}
