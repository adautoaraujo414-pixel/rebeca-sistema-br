export function useMoeda(valor) {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style:    'currency',
    currency: 'BRL',
  }).format(valor);
}

export function useFormato() {
  const moeda = (v) => {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL',
    }).format(v);
  };

  const numero = (v) => {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR').format(v);
  };

  const hora = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  return { moeda, numero, hora };
}
