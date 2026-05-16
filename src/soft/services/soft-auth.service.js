/**
 * soft-auth.service.js
 * Lógica de autenticação do módulo Rebeca Soft.
 * Isolado — sem imports de serviços de outros módulos.
 */
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SoftAdmin = require('../models/soft-admin.model');
const { softLogger } = require('../utils/soft-logger.util');
const { softLimites } = require('../middleware/soft-rate-limit.middleware');

const JWT_SECRET         = process.env.SOFT_JWT_SECRET || process.env.JWT_SECRET;
const ACCESS_EXPIRES_IN  = '15m';
const REFRESH_EXPIRES_IN = '30d';
const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000;

// Senha fake para bcrypt.compare quando usuário não existe (evita timing attack)
const HASH_FAKE = '$2a$10$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';

/**
 * _gerarTokens — gera par access + refresh token
 */
function _gerarTokens(adminId) {
  const accessToken = jwt.sign(
    { adminId: adminId.toString(), tipo: 'soft_access' },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
  const refreshTokenPlano = crypto.randomBytes(48).toString('hex');
  const refreshTokenHash  = crypto.createHash('sha256').update(refreshTokenPlano).digest('hex');

  return { accessToken, refreshTokenPlano, refreshTokenHash };
}

/**
 * login — autentica admin por email/senha
 * Proteção: rate limit por email (independente de IP), timing attack, enumeração
 *
 * @param {{ email: string, senha: string, ip: string }} dados
 * @returns {{ accessToken, refreshToken, admin }}
 */
async function login({ email, senha, ip }) {
  // Rate limit por email (independente de IP — contra brute force distribuído)
  const limiteEmail = softLimites.loginEmail(email.toLowerCase().trim());
  if (!limiteEmail.permitido) {
    const min = Math.ceil((limiteEmail.resetEm - Date.now()) / 60_000);
    softLogger.seguranca('BRUTE_FORCE_EMAIL', ip, { email });
    const err = new Error('AUTH_006');
    err.detalhe = String(min);
    throw err;
  }

  const admin = await SoftAdmin.findOne({ email: email.toLowerCase().trim() });

  // Sempre executa bcrypt.compare — evita timing attack por enumeração
  const senhaCorreta = await bcrypt.compare(senha, admin?.senhaHash || HASH_FAKE);

  if (!admin || !senhaCorreta) {
    softLogger.seguranca('LOGIN_FALHOU', ip, { email });
    const err = new Error('AUTH_001');
    throw err;
  }

  if (!admin.ativo) {
    const err = new Error('AUTH_005');
    throw err;
  }

  // Verificar bloqueio por tentativas
  if (admin.bloqueadoAte && admin.bloqueadoAte > new Date()) {
    const min = Math.ceil((admin.bloqueadoAte - Date.now()) / 60_000);
    const err = new Error('AUTH_006');
    err.detalhe = String(min);
    throw err;
  }

  const { accessToken, refreshTokenPlano, refreshTokenHash } = _gerarTokens(admin._id);

  // Salvar refresh token (hash) — array limitado a 5 pelo pre-save hook
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);
  admin.refreshTokens.push({ tokenHash: refreshTokenHash, expiresAt, ip });
  admin.ultimoLogin      = new Date();
  admin.tentativasLogin  = 0;
  admin.bloqueadoAte     = null;
  await admin.save();

  softLogger.info('Auth', 'Login bem-sucedido', { adminId: admin._id, email });

  return {
    accessToken,
    refreshToken: refreshTokenPlano,
    admin: {
      id:        admin._id,
      nome:      admin.nome,
      email:     admin.email,
      nomeLoja:  admin.nomeLoja,
      slug:      admin.slug,
      logo:      admin.logo,
      plano:     admin.plano,
      corPrimaria: admin.corPrimaria,
    },
  };
}

/**
 * refreshToken — gera novo par de tokens via refresh token válido
 *
 * @param {{ refreshToken: string, ip: string }} dados
 * @returns {{ accessToken, refreshToken }}
 */
async function refreshToken({ refreshToken: tokenPlano, ip }) {
  if (!tokenPlano) {
    const err = new Error('AUTH_004');
    throw err;
  }

  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

  const admin = await SoftAdmin.findOne({
    'refreshTokens.tokenHash': tokenHash,
    ativo: true,
  });

  if (!admin) {
    softLogger.seguranca('REFRESH_TOKEN_INVALIDO', ip, {});
    const err = new Error('AUTH_004');
    throw err;
  }

  // Verificar se o token não expirou
  const tokenDoc = admin.refreshTokens.find(t => t.tokenHash === tokenHash);
  if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
    // Remover token expirado
    admin.refreshTokens = admin.refreshTokens.filter(t => t.tokenHash !== tokenHash);
    await admin.save();
    const err = new Error('AUTH_004');
    throw err;
  }

  // Rotação de refresh token — invalidar o antigo, gerar novo par
  const { accessToken, refreshTokenPlano: novoPlano, refreshTokenHash: novoHash } = _gerarTokens(admin._id);

  admin.refreshTokens = admin.refreshTokens.filter(t => t.tokenHash !== tokenHash);
  admin.refreshTokens.push({
    tokenHash: novoHash,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
    ip,
  });
  await admin.save();

  softLogger.info('Auth', 'Token renovado', { adminId: admin._id });

  return { accessToken, refreshToken: novoPlano };
}

/**
 * logout — invalida refresh token específico
 *
 * @param {{ adminId: string, refreshToken: string }} dados
 */
async function logout({ adminId, refreshToken: tokenPlano }) {
  if (!tokenPlano) return; // logout silencioso se não tiver refresh token

  const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

  await SoftAdmin.updateOne(
    { _id: adminId },
    { $pull: { refreshTokens: { tokenHash } } }
  );

  softLogger.info('Auth', 'Logout realizado', { adminId });
}

/**
 * perfil — retorna dados do admin autenticado (sem dados sensíveis)
 *
 * @param {string} adminId
 */
async function perfil(adminId) {
  const admin = await SoftAdmin.findById(adminId)
    .select('nome email nomeLoja slug logo corPrimaria plano ativo ultimoLogin createdAt')
    .lean();

  if (!admin) {
    const err = new Error('ACE_002');
    throw err;
  }

  return admin;
}

module.exports = { login, refreshToken, logout, perfil };
