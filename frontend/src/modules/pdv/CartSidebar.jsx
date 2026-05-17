import { ShoppingCart } from 'lucide-react';
import { usePDVStore } from '../../stores/pdv.store';
import { CartItem } from './CartItem';

export function CartSidebar({ onFinalizar, caixaAberto }) {
  const itens    = usePDVStore(s => s.itens);
  const total    = usePDVStore(s => s.total());
  const qtdItens = usePDVStore(s => s.qtdItens());

  const vazio = itens.length === 0;

  return (
    <div style={{ width: 360, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', position: 'sticky', top: 'calc(var(--topbar-height) + var(--space-6))' }}>

      {/* Header */}
      <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <ShoppingCart size={18} color="var(--color-primary)" />
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)' }}>
          Carrinho
        </span>
        {qtdItens > 0 && (
          <span style={{ marginLeft: 'auto', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            {qtdItens}
          </span>
        )}
      </div>

      {/* Itens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-5)' }}>
        {vazio ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-3)', gap: 'var(--space-3)' }}>
            <ShoppingCart size={36} strokeWidth={1} />
            <span style={{ fontSize: 'var(--text-sm)' }}>Carrinho vazio</span>
            <span style={{ fontSize: 'var(--text-xs)', textAlign: 'center' }}>Busque um produto e pressione Enter</span>
          </div>
        ) : (
          itens.map(item => <CartItem key={item._id} item={item} />)
        )}
      </div>

      {/* Total + Finalizar */}
      <div style={{ padding: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-2)' }}>Total</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
            R$ {total.toFixed(2).replace('.', ',')}
          </span>
        </div>
        <button
          onClick={onFinalizar}
          disabled={vazio || !caixaAberto}
          style={{
            width: '100%', height: 'var(--btn-height-lg)',
            background: vazio || !caixaAberto ? 'var(--color-surface-2)' : 'var(--color-primary)',
            border: 'none', borderRadius: 'var(--radius-md)',
            color: vazio || !caixaAberto ? 'var(--color-text-3)' : '#fff',
            fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)',
            fontFamily: 'var(--font-sans)',
            cursor: vazio || !caixaAberto ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          {!caixaAberto ? 'Abra o caixa primeiro' : vazio ? 'Carrinho vazio' : 'Finalizar venda  F9'}
        </button>
      </div>
    </div>
  );
}
