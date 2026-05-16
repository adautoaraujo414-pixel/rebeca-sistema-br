/**
 * soft-errors.util.js
 * Catálogo centralizado de erros do módulo Rebeca Soft.
 * Nenhum outro módulo importa este arquivo.
 */

const SOFT_ERRORS = {
  // Autenticação
  AUTH_001: { code: 'AUTH_001', message: 'E-mail ou senha incorretos',               http: 401 },
  AUTH_002: { code: 'AUTH_002', message: 'Token expirado',                            http: 401 },
  AUTH_003: { code: 'AUTH_003', message: 'Token inválido',                            http: 401 },
  AUTH_004: { code: 'AUTH_004', message: 'Refresh token inválido ou expirado',        http: 401 },
  AUTH_005: { code: 'AUTH_005', message: 'Conta desativada',                          http: 403 },
  AUTH_006: { code: 'AUTH_006', message: 'Muitas tentativas. Tente novamente em {X} minutos', http: 429 },

  // Negócio
  NEG_001:  { code: 'NEG_001',  message: 'Produto não encontrado',                    http: 404 },
  NEG_002:  { code: 'NEG_002',  message: 'Estoque insuficiente',                      http: 409 },
  NEG_003:  { code: 'NEG_003',  message: 'Caixa já está aberto',                      http: 409 },
  NEG_004:  { code: 'NEG_004',  message: 'Caixa está fechado — abra o caixa para continuar', http: 409 },
  NEG_005:  { code: 'NEG_005',  message: 'Venda não pode ser cancelada neste status', http: 409 },
  NEG_006:  { code: 'NEG_006',  message: 'Este endereço já está em uso',              http: 409 },
  NEG_007:  { code: 'NEG_007',  message: 'Fornecedor possui compras — não é possível remover', http: 409 },
  NEG_008:  { code: 'NEG_008',  message: 'Produto possui histórico — use desativar em vez de remover', http: 409 },
  NEG_009:  { code: 'NEG_009',  message: 'Categoria possui produtos ativos',          http: 409 },
  NEG_010:  { code: 'NEG_010',  message: 'Nenhum caixa aberto encontrado',            http: 404 },

  // Validação
  VAL_001:  { code: 'VAL_001',  message: 'Campo obrigatório ausente',                 http: 400 },
  VAL_002:  { code: 'VAL_002',  message: 'Valor inválido',                            http: 400 },
  VAL_003:  { code: 'VAL_003',  message: 'Deve ser maior que zero',                   http: 400 },
  VAL_004:  { code: 'VAL_004',  message: 'Formato inválido',                          http: 400 },
  VAL_005:  { code: 'VAL_005',  message: 'Limite máximo excedido',                    http: 400 },

  // Upload
  UPL_001:  { code: 'UPL_001',  message: 'Tipo de arquivo não permitido',             http: 400 },
  UPL_002:  { code: 'UPL_002',  message: 'Arquivo muito grande (máximo 5MB)',         http: 400 },
  UPL_003:  { code: 'UPL_003',  message: 'Falha ao processar imagem',                 http: 500 },

  // Acesso
  ACE_001:  { code: 'ACE_001',  message: 'Acesso negado',                             http: 403 },
  ACE_002:  { code: 'ACE_002',  message: 'Recurso não encontrado',                    http: 404 },

  // Sistema
  SIS_001:  { code: 'SIS_001',  message: 'Erro interno — tente novamente',            http: 500 },
  SIS_002:  { code: 'SIS_002',  message: 'Serviço temporariamente indisponível',      http: 503 },
  SIS_003:  { code: 'SIS_003',  message: 'Operação demorou demais — tente novamente', http: 504 },
};

/**
 * Cria um objeto de erro padronizado.
 * @param {string} codigo - Chave do SOFT_ERRORS
 * @param {string} [detalhe] - Detalhe adicional para substituir {X} ou acrescentar contexto
 * @returns {{ code, message, http }}
 */
function softErro(codigo, detalhe) {
  const base = SOFT_ERRORS[codigo];
  if (!base) return { code: 'SIS_001', message: 'Erro interno', http: 500 };
  const message = detalhe
    ? base.message.replace('{X}', detalhe)
    : base.message;
  return { code: base.code, message, http: base.http };
}

module.exports = { SOFT_ERRORS, softErro };
