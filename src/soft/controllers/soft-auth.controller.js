/**
 * soft-auth.controller.js
 * Controller de autenticação do módulo Rebeca Soft.
 * Responsabilidade única: receber HTTP, chamar service, retornar response.
 * Sem lógica de negócio aqui.
 */
const authService = require('../services/soft-auth.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

/**
 * POST /api/soft/auth/login
 */
async function login(req, res) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({
      email,
      senha,
      ip: req.ip,
    });
    return softOk(res, resultado);
  } catch (err) {
    if (['AUTH_001','AUTH_002','AUTH_003','AUTH_004','AUTH_005','AUTH_006'].includes(err.message)) {
      return softErroRes(res, err.message, err.detalhe);
    }
    return softErroInterno(res, err);
  }
}

/**
 * POST /api/soft/auth/refresh
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    const resultado = await authService.refreshToken({
      refreshToken,
      ip: req.ip,
    });
    return softOk(res, resultado);
  } catch (err) {
    if (['AUTH_004'].includes(err.message)) {
      return softErroRes(res, err.message);
    }
    return softErroInterno(res, err);
  }
}

/**
 * POST /api/soft/auth/logout
 * Requer autenticação (softAutenticar já validou)
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    await authService.logout({
      adminId: req.softAdminId,
      refreshToken,
    });
    return softOk(res, { mensagem: 'Logout realizado com sucesso' });
  } catch (err) {
    return softErroInterno(res, err);
  }
}

/**
 * GET /api/soft/auth/perfil
 * Requer autenticação
 */
async function perfil(req, res) {
  try {
    const dados = await authService.perfil(req.softAdminId);
    return softOk(res, dados);
  } catch (err) {
    if (['ACE_002'].includes(err.message)) {
      return softErroRes(res, err.message);
    }
    return softErroInterno(res, err);
  }
}

module.exports = { login, refresh, logout, perfil };
