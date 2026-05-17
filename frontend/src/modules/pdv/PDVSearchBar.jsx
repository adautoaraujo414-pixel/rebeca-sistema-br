import { useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

export function PDVSearchBar({ value, onChange, onEnter, resultados, onSelect, loading }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function handleKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (resultados.length === 1) { onSelect(resultados[0]); return; }
      if (resultados.length > 1)   { onSelect(resultados[0]); return; }
      onEnter?.();
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)', pointerEvents: 'none' }} />
        <input
          ref={ref}
          id="pdv-busca"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Buscar produto ou código... (Enter para adicionar)"
          autoComplete="off"
          style={{
            width: '100%', height: 56,
            background: 'var(--color-surface)',
            border: '2px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            paddingLeft: 48, paddingRight: 'var(--space-4)',
            color: 'var(--color-text)',
            fontSize: 'var(--text-md)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            transition: 'border-color var(--transition-fast)',
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
          onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
        />
        {loading && (
          <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, border: '2px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        )}
      </div>

      {resultados.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
          {resultados.map((p, i) => (
            <div key={p._id}
              onClick={() => onSelect(p)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', borderBottom: i < resultados.length - 1 ? '1px solid var(--color-border)' : 'none', transition: 'background var(--transition-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>{p.nome}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-3)' }}>{p.categoriaNome || 'Sem categoria'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
                  R$ {p.preco.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: p.estoque > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {p.estoque > 0 ? `Estoque: ${p.estoque}` : 'Sem estoque'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
