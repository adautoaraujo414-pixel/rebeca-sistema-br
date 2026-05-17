import { api } from './api';

export const categoriasAdminApi = {
  listar:    (params) => api.get('/categorias', { params }).then(r => r.data),
  criar:     (dados)  => api.post('/categorias', dados).then(r => r.data.dados),
  atualizar: (id, dados) => api.put(`/categorias/${id}`, dados).then(r => r.data.dados),
  remover:   (id)    => api.delete(`/categorias/${id}`).then(r => r.data),
};
