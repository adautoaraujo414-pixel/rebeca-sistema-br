export function StockBadge({ estoque, estoqueMin = 0 }) {
  const critico = estoque <= 0;
  const baixo   = !critico && estoque <= (estoqueMin || 5);
  const ok      = !critico && !baixo;

  const cfg = critico
    ? { label: 'Sem estoque', bg: 'var(--color-error-bg)',   color: 'var(--color-error)'   }
    : baixo
    ? { label: `Baixo (${estoque})`, bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
    : { label: estoque,  bg: 'var(--color-success-bg)', color: 'var(--color-success)' };

  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      padding:      '2px 8px',
      borderRadius: 'var(--radius-full)',
      background:   cfg.bg,
      color:        cfg.color,
      fontSize:     'var(--text-xs)',
      fontWeight:   'var(--weight-medium)',
      fontFamily:   ok ? 'var(--font-mono)' : 'var(--font-sans)',
      whiteSpace:   'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}
