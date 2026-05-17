import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const FORMAS = [
  { id: 'dinheiro',       label: 'Dinheiro',       key: '1' },
  { id: 'pix',            label: 'PIX',             key: '2' },
  { id: 'cartao_debito',  label: 'Débito',          key: '3' },
  { id: 'cartao_credito', label: 'Crédito',         key: '4' },
  { id: 'fiado',          label: 'Fiado',           key: '5' },
];

export function PaymentModal({ total, onConfirmar, onCancelar, loading }) {
  const [forma,    setForma]    = useState('dinheiro');
  const [recebido, setRecebido] = useState('');

  const troco = forma === 'dinheiro' && recebido
    ? Math.max(0, parseFloat(recebido.replace(',', '.')) - total)
    : 0;

  const valorRecebido = parseFloat(recebido.replace(',', '.')) || 0;
  const podeConfirmar = forma !== 'dinheiro' || valorRecebido >= total;

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onCancelar(); return; }
      const f = FORMAS.find(f => f.key === e.key);
      if (f) setForma(f.id);
      if (e.key === 'Enter' && podeConfirmar && !loading) handleConfirmar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forma, podeConfirmar, loading, recebido]);

  function handleConfirmar() {
    onConfirmar({
      formaPagamento: forma,
      valorRecebido:  forma === 'dinheiro' ? valorRecebido : total,
      troco:          forma === 'dinheiro' ? troco : 0,
    });
  }

  return (
    <>
      <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', zIndex: 301, width: '100%', maxWidth: 440, animation: 'slideIn 200ms ease' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>Finalizar venda</h2>
          <button onClick={onCancelar} className="btn-icon"><X size={18} /></button>
        </div>

        {/* Total */}
        <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 4 }}>Total a pagar</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
            R$ {total.toFixed(2).replace('.', ',')}
          </div>
        </div>

        {/* Formas de pagamento */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 'var(--space-2)' }}>Forma de pagamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            {FORMAS.map(f => (
              <button key={f.id} onClick={() => setForma(f.id)} style={{
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                border: `1px solid ${forma === f.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: forma === f.id ? 'var(--color-primary-bg)' : 'transparent',
                color: forma === f.id ? 'var(--color-primary)' : 'var(--color-text-2)',
                cursor: 'pointer', fontSize: 'var(--text-sm)',
                fontWeight: forma === f.id ? 'var(--weight-semi)' : 'var(--weight-normal)',
                fontFamily: 'var(--font-sans)',
                transition: 'all var(--transition-fast)',
              }}>
                <span style={{ fontSize: 'var(--text-xs)', opacity: 0.6 }}>[{f.key}] </span>{f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Valor recebido (só dinheiro) */}
        {forma === 'dinheiro' && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 'var(--space-2)' }}>Valor recebido</div>
            <input
              autoFocus
              type="number" step="0.01" min={total}
              value={recebido}
              onChange={e => setRecebido(e.target.value)}
              placeholder={total.toFixed(2)}
              style={{
                width: '100%', height: 'var(--input-height)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 var(--space-3)',
                color: 'var(--color-text)', fontSize: 'var(--text-md)',
                fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
            />
            {troco > 0 && (
              <div style={{ marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>Troco</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-bold)', color: 'var(--color-success)' }}>
                  R$ {troco.toFixed(2).replace('.', ',')}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleConfirmar}
          disabled={!podeConfirmar || loading}
          style={{
            width: '100%', height: 'var(--btn-height-lg)',
            background: !podeConfirmar || loading ? 'var(--color-surface-2)' : 'var(--color-success)',
            border: 'none', borderRadius: 'var(--radius-md)',
            color: !podeConfirmar || loading ? 'var(--color-text-3)' : '#fff',
            fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)',
            fontFamily: 'var(--font-sans)',
            cursor: !podeConfirmar || loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processando...' : 'Confirmar venda  ↵'}
        </button>
      </div>
    </>
  );
}
