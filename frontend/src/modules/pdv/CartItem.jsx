import { memo } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { usePDVStore } from '../../stores/pdv.store';

export const CartItem = memo(function CartItem({ item }) {
  const { setQty, removerItem } = usePDVStore();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.nome}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-3)', fontFamily: 'var(--font-mono)' }}>
          R$ {item.preco.toFixed(2).replace('.', ',')} × {item.qty}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <button onClick={() => setQty(item._id, item.qty - 1)} className="btn-icon" style={{ width: 28, height: 28 }}>
          <Minus size={12} />
        </button>
        <span style={{ width: 28, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', color: 'var(--color-text)', fontWeight: 'var(--weight-semi)' }}>
          {item.qty}
        </span>
        <button onClick={() => setQty(item._id, item.qty + 1)} className="btn-icon" style={{ width: 28, height: 28 }}>
          <Plus size={12} />
        </button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>
        R$ {(item.preco * item.qty).toFixed(2).replace('.', ',')}
      </div>

      <button onClick={() => removerItem(item._id)} className="btn-icon" style={{ color: 'var(--color-error)', flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
});
