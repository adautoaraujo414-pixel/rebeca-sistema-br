'use strict';

function normalizarSlug(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // remove caracteres especiais
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function gerarSlugUnico(AdminAgenda, nomeNegocio, adminIdAtual) {
  const base = normalizarSlug(nomeNegocio) || 'espaco';
  let slug = base;
  let contador = 1;
  while (true) {
    const existente = await AdminAgenda.findOne({ slug, _id: { $ne: adminIdAtual } }).select('_id').lean();
    if (!existente) return slug;
    contador++;
    slug = `${base}-${contador}`;
  }
}

module.exports = { normalizarSlug, gerarSlugUnico };
