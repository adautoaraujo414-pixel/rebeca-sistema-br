import { useState } from 'react';
import { X } from 'lucide-react';

export function CaixaModal({ modo, onConfirmar, onCancelar, loading }) {
  const [valor, setValor] = useState('');

  const inp = {
    width: '100%', height: 'var(--input-height)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-3)',
    color: 'var(--color-text)', fontSize: 'var(--text-md)',
    fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <>
      <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', zIndex: 301, width: '100%', maxWidth: 380, animation: 'slideIn 200ms ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
            {modo === 'abrir' ? 'Abrir caixa' : 'Fechar caixa'}
          </h2>
          <button onClick={onCancelar} className="btn-icon"><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 'var(--space-2)' }}>
            {modo === 'abrir' ? 'Troco inicial (fundo de caixa)' : 'Valor final em caixa'}
          </div>
          <input autoFocus type="number" step="0.01" min="0"
            value={valor} onChange={e => setValor(e.target.value)}
            placeholder="0,00" style={inp}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
            onKeyDown={e => e.key === 'Enter' && onConfirmar(parseFloat(valor.replace(',', '.')) || 0)}
          />
        </div>
        <button onClick={() => onConfirmar(parseFloat(valor.replace(',', '.')) || 0)}
          disabled={loading}
          style={{ width: '100%', height: 'var(--btn-height-md)', background: loading ? 'var(--color-surface-2)' : 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: loading ? 'var(--color-text-3)' : '#fff', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-sans)', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Aguarde...' : (modo === 'abrir' ? 'Abrir caixa' : 'Fechar caixa')}
        </button>
      </div>
    </>
  );
}
