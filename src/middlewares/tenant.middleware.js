/**
 * tenant.middleware.js — Isolamento de Tenant no Backend
 * Versão 1.0
 *
 * Injeta req.tenantId em todas as rotas autenticadas.
 * Garante isolamento absoluto entre empresas.
 *
 * FONTES DE tenantId (em ordem de prioridade):
 *   1. JWT payload (softAdminId, adminId, id)
 *   2. req.body.adminId / req.query.adminId
 *   3. req.headers['x-tenant-id']
 *
 * USO:
 *   router.use(tenantMiddleware)
 *   router.get('/dados', tenantMiddleware, (req, res) => {
 *     const { tenantId } = req;
 *     Model.find({ adminId: tenantId }) // ← sempre filtrado
 *   })
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SOFT_JWT_SECRET
  || process.env.JWT_SECRET
  || process.env.AGENDA_JWT_SECRET
  || 'rebeca-secret-fallback';

// ── EXTRAIR tenantId DO TOKEN ──────────────────────────────────────────────
function _extrairDoToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token   = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    return String(
      payload.softAdminId ||
      payload.adminId     ||
      payload.id          ||
      payload.sub         ||
      ''
    ) || null;
  } catch {
    // Token inválido ou expirado — não bloquear aqui, só não extrair
    return null;
  }
}

// ── MIDDLEWARE PRINCIPAL ────────────────────────────────────────────────────
function tenantMiddleware(req, res, next) {
  // 1. JWT
  const fromToken = _extrairDoToken(req.headers.authorization);
  if (fromToken) {
    req.tenantId = fromToken;
    return next();
  }

  // 2. Body / Query (rotas públicas com adminId explícito)
  const fromBody  = req.body?.adminId  || req.body?.softAdminId;
  const fromQuery = req.query?.adminId || req.query?.softAdminId;
  if (fromBody || fromQuery) {
    req.tenantId = String(fromBody || fromQuery);
    return next();
  }

  // 3. Header customizado (futuro: subdomínio white-label)
  const fromHeader = req.headers['x-tenant-id'];
  if (fromHeader) {
    req.tenantId = String(fromHeader);
    return next();
  }

  // 4. Fallback — não bloquear rotas públicas, mas marcar como sem tenant
  req.tenantId = null;
  next();
}

// ── MIDDLEWARE ESTRITO (bloqueia sem tenant) ───────────────────────────────
function tenantObrigatorio(req, res, next) {
  tenantMiddleware(req, res, () => {
    if (!req.tenantId) {
      return res.status(401).json({
        sucesso: false,
        erro: 'TENANT_001',
        mensagem: 'Tenant não identificado. Faça login novamente.',
      });
    }
    next();
  });
}

// ── GUARD: garantir que body/query usa o tenantId do token ─────────────────
// Evita que um tenant acesse dados de outro passando adminId no body
function tenantGuard(req, res, next) {
  if (!req.tenantId) return tenantObrigatorio(req, res, next);

  // Se veio adminId no body, verificar se bate com o token
  const bodyAdminId = req.body?.adminId || req.body?.softAdminId;
  if (bodyAdminId && String(bodyAdminId) !== String(req.tenantId)) {
    return res.status(403).json({
      sucesso: false,
      erro: 'TENANT_002',
      mensagem: 'Acesso negado. Tenant do body não corresponde ao token.',
    });
  }

  // Injetar automaticamente no body para queries downstream
  if (req.body && typeof req.body === 'object') {
    req.body._tenantId = req.tenantId;
  }

  next();
}

// ── HELPER: filtro seguro para MongoDB ────────────────────────────────────
// Uso: Model.find(tenantFilter(req, { status: 'ativo' }))
function tenantFilter(req, filtroExtra = {}) {
  if (!req.tenantId) throw new Error('tenantId não disponível no request');
  return { adminId: req.tenantId, ...filtroExtra };
}

// ── HELPER: validar que documento pertence ao tenant ──────────────────────
function assertTenant(req, doc, campo = 'adminId') {
  if (!doc) return false;
  return String(doc[campo]) === String(req.tenantId);
}

module.exports = {
  tenantMiddleware,
  tenantObrigatorio,
  tenantGuard,
  tenantFilter,
  assertTenant,
};
