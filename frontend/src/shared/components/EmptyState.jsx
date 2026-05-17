export function EmptyState({ icon: Icon, titulo, descricao }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      justifyContent:'center',
      padding:       'var(--space-10) var(--space-6)',
      gap:           'var(--space-3)',
      color:         'var(--color-text-3)',
      textAlign:     'center',
    }}>
      {Icon && <Icon size={32} strokeWidth={1.5} />}
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-2)' }}>
        {titulo}
      </div>
      {descricao && (
        <div style={{ fontSize: 'var(--text-sm)', maxWidth: 280 }}>
          {descricao}
        </div>
      )}
    </div>
  );
}
