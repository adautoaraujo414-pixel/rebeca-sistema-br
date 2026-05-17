import { useQuery } from '@tanstack/react-query';
import { financeiroApi } from '../../services/financeiro.api';

const STALE = 1000 * 60 * 5;

export function useOperacional(filtros) {
  return useQuery({
    queryKey: ['financeiro', 'operacional', filtros],
    queryFn:  () => financeiroApi.operacional(filtros),
    staleTime: STALE,
    keepPreviousData: true,
  });
}

export function useFluxo(filtros) {
  return useQuery({
    queryKey: ['financeiro', 'fluxo', filtros],
    queryFn:  () => financeiroApi.fluxo(filtros),
    staleTime: STALE,
    keepPreviousData: true,
  });
}

export function useLucro(filtros) {
  return useQuery({
    queryKey: ['financeiro', 'lucro', filtros],
    queryFn:  () => financeiroApi.lucro(filtros),
    staleTime: STALE,
    keepPreviousData: true,
  });
}

export function useFormasPagamento(filtros) {
  return useQuery({
    queryKey: ['financeiro', 'formas', filtros],
    queryFn:  () => financeiroApi.formas(filtros),
    staleTime: STALE,
    keepPreviousData: true,
  });
}
