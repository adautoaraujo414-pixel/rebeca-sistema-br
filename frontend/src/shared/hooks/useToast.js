import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);

  const mostrar = useCallback((mensagem, tipo = 'success') => {
    setToast({ mensagem, tipo, id: Date.now() });
  }, []);

  const fechar = useCallback(() => setToast(null), []);

  return { toast, mostrar, fechar };
}
