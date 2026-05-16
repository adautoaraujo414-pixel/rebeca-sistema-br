/**
 * _index.js — carregamento centralizado dos models do Rebeca Soft.
 * Importar este arquivo garante que todos os schemas estão registrados
 * antes de qualquer query ser executada.
 */
require('./soft-admin.model');
require('./soft-categoria.model');
require('./soft-produto.model');
require('./soft-fornecedor.model');
require('./soft-estoque.model');
require('./soft-caixa.model');
require('./soft-venda.model');
require('./soft-movimentacao.model');
require('./soft-compra.model');
require('./soft-cliente.model');
require('./soft-despesa.model');
require('./soft-catalogo-config.model');

const mongoose = require('mongoose');
module.exports = mongoose;
