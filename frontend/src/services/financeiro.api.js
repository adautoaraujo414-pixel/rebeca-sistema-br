import { api } from './api';

export const financeiroApi = {
  operacional: (params) => api.get('/financeiro/operacional', { params }).then(r => r.data.dados),
  fluxo:       (params) => api.get('/financeiro/fluxo',       { params }).then(r => r.data.dados),
  lucro:       (params) => api.get('/financeiro/lucro',       { params }).then(r => r.data.dados),
  formas:      (params) => api.get('/financeiro/vendas/formas', { params }).then(r => r.data.dados),
};
