import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriasAdminApi } from '../../services/categorias.api';

const KEY = 'categorias';

export function useCategoriasAdmin(filtros = {}) {
  return useQuery({
    queryKey:  [KEY, 'admin', filtros],
    queryFn:   () => categoriasAdminApi.listar(filtros),
    staleTime: 1000 * 60 * 5,
    keepPreviousData: true,
  });
}

export function useCriarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriasAdminApi.criar,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAtualizarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }) => categoriasAdminApi.atualizar(id, dados),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRemoverCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriasAdminApi.remover,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
