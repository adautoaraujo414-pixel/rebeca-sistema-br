// ===================================================================
// Script isolado: cadastra/atualiza um telefone -> adminId no
// sistema de impressoras. Roda direto no terminal, nao depende
// de nenhuma rota HTTP nem de outro modulo alem do model.
//
// Uso:
//   node src/scripts/cadastrar-impressora.js "34977860003" "araujo-planejados-01" "Araujo Planejados"
// ===================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const ImpressoraCadastro = require('../models/ImpressoraCadastro.model');

async function main() {
  const [, , telefoneArg, adminIdArg, nomeArg] = process.argv;

  if (!telefoneArg || !adminIdArg) {
    console.error('Uso: node src/scripts/cadastrar-impressora.js "<telefone>" "<adminId>" "<nomeCliente opcional>"');
    process.exit(1);
  }

  const telefone = telefoneArg.replace(/\D/g, '');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Cadastro] Conectado ao MongoDB.');

  const doc = await ImpressoraCadastro.findOneAndUpdate(
    { telefone },
    { telefone, adminId: adminIdArg, nomeCliente: nomeArg || '', ativo: true },
    { upsert: true, new: true }
  );

  console.log('[Cadastro] Cliente cadastrado/atualizado com sucesso:');
  console.log(doc);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((erro) => {
  console.error('[Cadastro] ERRO:', erro.message);
  process.exit(1);
});
