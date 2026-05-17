import { create } from 'zustand';

export const usePDVStore = create((set, get) => ({
  // Carrinho
  itens: [],
  
  // Caixa
  caixa: null,
  
  // UI
  buscando: false,
  finalizando: false,

  // Carrinho — adicionar ou incrementar
  adicionarItem: (produto) => {
    const itens = get().itens;
    const idx   = itens.findIndex(i => i._id === produto._id);
    if (idx >= 0) {
      const novos = [...itens];
      novos[idx] = { ...novos[idx], qty: novos[idx].qty + 1 };
      set({ itens: novos });
    } else {
      set({ itens: [...itens, { ...produto, qty: 1 }] });
    }
  },

  // Alterar quantidade (0 = remover)
  setQty: (id, qty) => {
    if (qty <= 0) {
      set({ itens: get().itens.filter(i => i._id !== id) });
    } else {
      set({ itens: get().itens.map(i => i._id === id ? { ...i, qty } : i) });
    }
  },

  // Remover item
  removerItem: (id) => set({ itens: get().itens.filter(i => i._id !== id) }),

  // Remover último item
  removerUltimo: () => {
    const itens = get().itens;
    if (!itens.length) return;
    const ultimo = itens[itens.length - 1];
    if (ultimo.qty > 1) {
      set({ itens: itens.map((i, idx) => idx === itens.length - 1 ? { ...i, qty: i.qty - 1 } : i) });
    } else {
      set({ itens: itens.slice(0, -1) });
    }
  },

  // Limpar carrinho
  limpar: () => set({ itens: [] }),

  // Caixa
  setCaixa:      (c) => set({ caixa: c }),
  setBuscando:   (v) => set({ buscando: v }),
  setFinalizando:(v) => set({ finalizando: v }),

  // Totais (computed)
  total: () => get().itens.reduce((s, i) => s + i.preco * i.qty, 0),
  qtdItens: () => get().itens.reduce((s, i) => s + i.qty, 0),
}));
