import { api } from './api';

export const caixaApi = {
  atual:   ()       => api.get('/caixa/atual').then(r => r.data.dados),
  abrir:   (dados)  => api.post('/caixa/abrir', dados).then(r => r.data.dados),
  fechar:  (dados)  => api.post('/caixa/fechar', dados).then(r => r.data.dados),
};

export const vendaApi = {
  criar: (dados) => api.post('/vendas', dados).then(r => r.data.dados),
};

export const produtoPDVApi = {
  buscar: (busca) =>
    api.get('/produtos', { params: { busca, limite: 8, ativo: true } })
       .then(r => r.data.dados || []),
};
