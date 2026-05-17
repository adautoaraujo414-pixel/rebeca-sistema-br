import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

export function useDashboard() {
  return useQuery({
    queryKey:  ['dashboard', 'operacional'],
    queryFn:   () => api.get('/financeiro/operacional').then(r => r.data.dados),
    staleTime: 1000 * 60 * 2,   // 2 min — dados operacionais mudam rápido
    retry:     1,
    refetchInterval: 1000 * 60 * 5, // auto-refresh a cada 5 min
  });
}
