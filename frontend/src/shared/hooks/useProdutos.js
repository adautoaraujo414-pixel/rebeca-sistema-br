import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { produtosApi, categoriasApi } from '../../services/produtos.api';

const KEY = 'produtos';
const STALE = 1000 * 60 * 3; // 3 min

export function useProdutos(filtros = {}) {
  return useQuery({
    queryKey:  [KEY, filtros],
    queryFn:   () => produtosApi.listar(filtros),
    staleTime: STALE,
    keepPreviousData: true, // paginação suave
  });
}

export function useCategorias() {
  return useQuery({
    queryKey:  ['categorias'],
    queryFn:   categoriasApi.listar,
    staleTime: 1000 * 60 * 10, // categorias mudam pouco
  });
}

export function useCriarProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: produtosApi.criar,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAtualizarProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }) => produtosApi.atualizar(id, dados),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRemoverProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: produtosApi.remover,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
