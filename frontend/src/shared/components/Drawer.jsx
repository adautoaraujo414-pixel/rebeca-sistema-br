import { X } from 'lucide-react';

export function Drawer({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 100,
          animation: 'fadeIn 200ms ease',
        }}
      />
      {/* Painel */}
      <div style={{
        position:    'fixed',
        top: 0, right: 0, bottom: 0,
        width:       '100%',
        maxWidth:    480,
        background:  'var(--color-surface)',
        borderLeft:  '1px solid var(--color-border)',
        zIndex:      101,
        display:     'flex',
        flexDirection: 'column',
        animation:   'slideInRight 250ms ease',
      }}>
        {/* Header */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          padding:       'var(--space-5) var(--space-6)',
          borderBottom:  '1px solid var(--color-border)',
        }}>
          <h2 style={{
            fontSize:   'var(--text-md)',
            fontWeight: 'var(--weight-semi)',
            color:      'var(--color-text)',
          }}>
            {title}
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>
        {/* Conteúdo */}
        <div style={{
          flex:       1,
          overflowY:  'auto',
          padding:    'var(--space-6)',
        }}>
          {children}
        </div>
      </div>
    </>
  );
}
