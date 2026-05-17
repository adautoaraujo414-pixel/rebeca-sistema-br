import { api } from './api';

export const produtosApi = {
  listar: (params) =>
    api.get('/produtos', { params }).then(r => r.data),

  buscar: (id) =>
    api.get(`/produtos/${id}`).then(r => r.data.dados),

  criar: (dados) =>
    api.post('/produtos', dados).then(r => r.data.dados),

  atualizar: (id, dados) =>
    api.put(`/produtos/${id}`, dados).then(r => r.data.dados),

  remover: (id) =>
    api.delete(`/produtos/${id}`).then(r => r.data),

  reativar: (id) =>
    api.patch(`/produtos/${id}/reativar`).then(r => r.data),
};

export const categoriasApi = {
  listar: () =>
    api.get('/categorias', { params: { limite: 100 } }).then(r => r.data.dados || []),
};
