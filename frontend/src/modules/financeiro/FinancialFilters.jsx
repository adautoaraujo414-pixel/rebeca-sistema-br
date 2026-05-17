export function FinancialFilters({ periodo, onChange }) {
  const opcoes = [
    { label: 'Hoje',       value: 'hoje' },
    { label: '7 dias',     value: '7dias' },
    { label: '30 dias',    value: '30dias' },
    { label: 'Este mês',   value: 'mes' },
    { label: 'Este ano',   value: 'ano' },
  ];

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      {opcoes.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: 'var(--space-2) var(--space-3)',
          background: periodo === o.value ? 'var(--color-primary)' : 'transparent',
          border: `1px solid ${periodo === o.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          color: periodo === o.value ? '#fff' : 'var(--color-text-2)',
          cursor: 'pointer', fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          fontWeight: periodo === o.value ? 'var(--weight-medium)' : 'var(--weight-normal)',
          transition: 'all var(--transition-fast)',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
