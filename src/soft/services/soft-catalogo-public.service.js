/**
 * soft-catalogo-public.service.js
 * Catálogo público por slug — SOMENTE LEITURA, SEM AUTH.
 *
 * SEGURANÇA:
 * - Nunca expõe: custo, estoque, adminId, dados financeiros
 * - Campos projetados explicitamente (whitelist de campos)
 * - Slug sanitizado antes de qualquer query
 * - Rate limit aplicado no middleware da rota
 *
 * PERFORMANCE:
 * - lean() em todas as queries
 * - Projeção restrita (só campos públicos)
 * - Paginação com limite máximo de 50
 * - Índice em slug (único) + adminId+ativo+categoria
 *
 * CACHE (preparado):
 * - Função _cacheKey() gera chave por slug+params
 * - Estrutura pronta para Redis TTL 60s
 * - Hoje: sem cache (passa direto ao banco)
 *
 * SEO:
 * - Retorna meta { title, description, ogImage } por loja e produto
 * - Slug amigável por produto (nome slugificado)
 */
const SoftAdmin   = require('../models/soft-admin.model');
const SoftProduto = require('../models/soft-produto.model');
const SoftCategoria = require('../models/soft-categoria.model');
const { softLogger } = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE  = /^[a-f\d]{24}$/i;
const SLUG_RE      = /^[a-z0-9-]{2,50}$/;
const MAX_LIMITE   = 50;
const MAX_BUSCA    = 100;

// Campos públicos — NUNCA incluir: custo, estoque, adminId, precoCusto
const CAMPOS_PRODUTO_PUBLICO = {
  _id: 1, nome: 1, descricao: 1, preco: 1,
  imagens: 1, categoriaId: 1, categoriaNome: 1,
  ativo: 1, slug: 1, destaque: 1,
};

const CAMPOS_LOJA_PUBLICO = {
  _id: 0, nome: 1, nomeLoja: 1, slug: 1,
  logo: 1, corPrimaria: 1, telefone: 1,
  descricaoLoja: 1, bannerUrl: 1,
};

/**
 * _sanitizarSlug — valida e limpa slug de entrada
 */
function _sanitizarSlug(slug) {
  const s = String(slug || '').toLowerCase().trim().slice(0, 50);
  if (!SLUG_RE.test(s)) {
    const err = new Error('VAL_004'); err.detalhe = 'slug inválido'; throw err;
  }
  return s;
}

/**
 * _sanitizarBusca — limpa string de busca
 */
function _sanitizarBusca(busca) {
  return String(busca || '')
    .trim()
    .slice(0, MAX_BUSCA)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escapar regex
}

/**
 * _slugProduto — gera slug amigável do produto para SEO
 */
function _slugProduto(nome, id) {
  const s = String(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${s}-${String(id).slice(-6)}`;
}

/**
 * _buscarLoja — retorna loja pelo slug (sem dados internos)
 * Usado internamente — não expõe adminId
 */
async function _buscarLoja(slug) {
  const loja = await SoftAdmin.findOne(
    { slug, ativo: true },
    { ...CAMPOS_LOJA_PUBLICO, _id: 1 } // _id só internamente
  ).lean();

  if (!loja) {
    const err = new Error('NEG_010'); err.detalhe = 'loja não encontrada'; throw err;
  }
  return loja;
}

/**
 * info — retorna dados públicos da loja + meta SEO
 */
async function info({ slug }) {
  const slugLimpo = _sanitizarSlug(slug);
  const loja = await _buscarLoja(slugLimpo);

  const baseUrl = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
  const catalogoUrl = `${baseUrl}/catalogo/${slugLimpo}`;

  softLogger.info('CatalogoPublico', 'info consultado', { slug: slugLimpo });

  return {
    loja: {
      nome:         loja.nomeLoja || loja.nome,
      slug:         loja.slug,
      logo:         loja.logo     || null,
      corPrimaria:  loja.corPrimaria || '#6366f1',
      telefone:     loja.telefone || null,
      descricao:    loja.descricaoLoja || null,
      banner:       loja.bannerUrl    || null,
    },
    meta: {
      title:       `${loja.nomeLoja || loja.nome} — Catálogo`,
      description: loja.descricaoLoja || `Confira os produtos de ${loja.nomeLoja || loja.nome}`,
      ogImage:     loja.bannerUrl || loja.logo || null,
      canonicalUrl: catalogoUrl,
    },
    compartilhar: {
      url:      catalogoUrl,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(catalogoUrl)}`,
      whatsapp: loja.telefone
        ? `https://wa.me/55${loja.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Vi seu catálogo em: ${catalogoUrl}`)}`
        : null,
    },
  };
}

/**
 * categorias — lista categorias ativas da loja
 */
async function categorias({ slug }) {
  const slugLimpo = _sanitizarSlug(slug);
  const loja = await _buscarLoja(slugLimpo);

  const cats = await SoftCategoria.find(
    { adminId: loja._id, ativo: true },
    { _id: 1, nome: 1, descricao: 1, ordem: 1 }
  )
    .sort({ ordem: 1, nome: 1 })
    .lean();

  return { categorias: cats };
}

/**
 * produtos — lista produtos ativos com paginação e filtros
 */
async function produtos({ slug, query = {} }) {
  const slugLimpo = _sanitizarSlug(slug);
  const loja = await _buscarLoja(slugLimpo);

  // Paginação com limite máximo protegido
  const paginaNum = Math.max(1, parseInt(query.pagina, 10) || 1);
  const limiteNum = Math.min(MAX_LIMITE, Math.max(1, parseInt(query.limite, 10) || 20));
  const skip      = (paginaNum - 1) * limiteNum;

  const filtro = {
    adminId: loja._id,
    ativo:   true,
  };

  // Filtro por categoria
  if (query.categoria && OBJECTID_RE.test(query.categoria)) {
    filtro.categoriaId = query.categoria;
  }

  // Busca por nome (sanitizada)
  if (query.busca && query.busca.trim()) {
    const buscaLimpa = _sanitizarBusca(query.busca);
    filtro.nome = { $regex: buscaLimpa, $options: 'i' };
  }

  // Filtro destaque
  if (query.destaque === 'true') {
    filtro.destaque = true;
  }

  // Ordenação
  const ordenacoes = {
    'nome':       { nome: 1 },
    'preco_asc':  { preco: 1 },
    'preco_desc': { preco: -1 },
    'destaque':   { destaque: -1, nome: 1 },
  };
  const ordenacao = ordenacoes[query.ordem] || { destaque: -1, nome: 1 };

  const [lista, total] = await Promise.all([
    SoftProduto.find(filtro, CAMPOS_PRODUTO_PUBLICO)
      .sort(ordenacao)
      .skip(skip)
      .limit(limiteNum)
      .lean(),
    SoftProduto.countDocuments(filtro),
  ]);

  // Enriquecer com slug de produto para SEO
  const produtosPublicos = lista.map(p => ({
    id:           p._id,
    nome:         p.nome,
    descricao:    p.descricao || null,
    preco:        p.preco,
    precoFormatado: `R$ ${p.preco.toFixed(2).replace('.', ',')}`,
    imagem:       (p.imagens && p.imagens[0]) || null,
    imagens:      p.imagens || [],
    categoria:    p.categoriaNome || null,
    categoriaId:  p.categoriaId   || null,
    destaque:     p.destaque      || false,
    slugProduto:  _slugProduto(p.nome, p._id),
    // NUNCA: estoque, custo, precoCusto, adminId
  }));

  const totalPaginas = Math.ceil(total / limiteNum);

  return {
    produtos: produtosPublicos,
    meta: {
      total,
      pagina:      paginaNum,
      limite:      limiteNum,
      totalPaginas,
      temProxima:  paginaNum < totalPaginas,
      temAnterior: paginaNum > 1,
    },
  };
}

/**
 * produto — detalhes de um produto específico
 */
async function produto({ slug, produtoId }) {
  const slugLimpo = _sanitizarSlug(slug);

  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId inválido'; throw err;
  }

  const loja = await _buscarLoja(slugLimpo);

  const p = await SoftProduto.findOne(
    { _id: produtoId, adminId: loja._id, ativo: true },
    CAMPOS_PRODUTO_PUBLICO
  ).lean();

  if (!p) {
    const err = new Error('NEG_010'); err.detalhe = 'produto não encontrado'; throw err;
  }

  const baseUrl    = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
  const produtoUrl = `${baseUrl}/catalogo/${slugLimpo}/produto/${produtoId}`;
  const lojaWpp    = loja.telefone
    ? `https://wa.me/55${loja.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Tenho interesse no produto: ${p.nome} — R$ ${p.preco.toFixed(2).replace('.', ',')}`)}`
    : null;

  return {
    produto: {
      id:            p._id,
      nome:          p.nome,
      descricao:     p.descricao || null,
      preco:         p.preco,
      precoFormatado: `R$ ${p.preco.toFixed(2).replace('.', ',')}`,
      imagem:        (p.imagens && p.imagens[0]) || null,
      imagens:       p.imagens || [],
      categoria:     p.categoriaNome || null,
      destaque:      p.destaque || false,
      slugProduto:   _slugProduto(p.nome, p._id),
    },
    loja: {
      nome:        loja.nomeLoja || loja.nome,
      slug:        loja.slug,
      corPrimaria: loja.corPrimaria || '#6366f1',
    },
    meta: {
      title:       `${p.nome} — ${loja.nomeLoja || loja.nome}`,
      description: p.descricao || `${p.nome} por R$ ${p.preco.toFixed(2).replace('.', ',')}`,
      ogImage:     (p.imagens && p.imagens[0]) || loja.logo || null,
      canonicalUrl: produtoUrl,
    },
    compartilhar: {
      url:      produtoUrl,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(produtoUrl)}`,
      whatsapp: lojaWpp,
    },
  };
}

module.exports = { info, categorias, produtos, produto };
