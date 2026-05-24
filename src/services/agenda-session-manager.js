'use strict';

/**
 * SessionManager — Memória contextual por conversa WhatsApp
 * Isolado por adminId + telefone (multi-tenant seguro)
 * TTL: 30 minutos de inatividade limpa a sessão
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_HISTORICO = 10; // máximo de trocas no histórico

// Map principal: chave = `${adminId}:${telefone}`
const _sessions = new Map();

// Limpeza automática a cada 10 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [key, session] of _sessions.entries()) {
    if (agora - session.timestampUltimaMsg > TTL_MS) {
      _sessions.delete(key);
    }
  }
}, 10 * 60 * 1000);

function _chave(adminId, telefone) {
  return `${String(adminId)}:${String(telefone).replace(/\D/g, '')}`;
}

function _sessionVazia() {
  return {
    historico: [],               // [{role:'user'|'assistant', content:'...'}]
    assuntoAtual: null,          // 'financeiro'|'agenda'|'lembrete'|'cliente'|null
    aguardandoConfirmacao: false,
    ultimaPerguntaIA: null,
    ultimaAcaoPendente: null,    // {tipo, dados} — ação que aguarda "sim/ok"
    ultimoValorFinanceiro: null, // {entradas, saidas, resultado} — trava anti-alucinação
    ultimoClienteCitado: null,
    ultimoAgendamento: null,
    ultimoTopicoFinanceiro: null,
    timestampUltimaMsg: Date.now()
  };
}

/**
 * Retorna sessão atual ou cria nova
 */
function getSession(adminId, telefone) {
  const key = _chave(adminId, telefone);
  if (!_sessions.has(key)) {
    _sessions.set(key, _sessionVazia());
  }
  return _sessions.get(key);
}

/**
 * Adiciona mensagem do usuário ao histórico
 */
function addUserMsg(adminId, telefone, texto) {
  const s = getSession(adminId, telefone);
  s.historico.push({ role: 'user', content: texto });
  if (s.historico.length > MAX_HISTORICO * 2) {
    s.historico = s.historico.slice(-MAX_HISTORICO * 2);
  }
  s.timestampUltimaMsg = Date.now();
  return s;
}

/**
 * Adiciona resposta da IA ao histórico
 */
function addAssistantMsg(adminId, telefone, texto) {
  const s = getSession(adminId, telefone);
  s.historico.push({ role: 'assistant', content: texto });
  s.ultimaPerguntaIA = texto;
  s.timestampUltimaMsg = Date.now();
  return s;
}

/**
 * Atualiza estado da sessão
 */
function updateSession(adminId, telefone, updates) {
  const s = getSession(adminId, telefone);
  Object.assign(s, updates, { timestampUltimaMsg: Date.now() });
  return s;
}

/**
 * Detecta se mensagem é confirmação de ação pendente
 */
function isConfirmacao(texto) {
  return /^\s*(sim|s|ok|pode|faz|confirm[ao]|vai|bora|isso|exato|certo|claro|perfeito|ótimo|otimo|manda|envia|salva|registra)\s*[!.]?\s*$/i.test(texto.trim());
}

/**
 * Detecta se mensagem é negação
 */
function isNegacao(texto) {
  return /^\s*(n[aã]o|nao|nel|cancel[ao]|esquece|deixa|para)\s*[!.]?\s*$/i.test(texto.trim());
}

/**
 * Detecta assunto principal da mensagem
 */
function detectarAssunto(texto) {
  const t = texto.toLowerCase();
  if (/financeiro|faturei|entrada|saída|saida|receita|despesa|gasto|lucro|dinheiro|caixa|pix|pagou/.test(t)) return 'financeiro';
  if (/agenda|agendamento|horário|horario|cliente.*hora|marcou|agendou/.test(t)) return 'agenda';
  if (/lembr[ae]|lembrete|avisa/.test(t)) return 'lembrete';
  if (/cliente|contato|inativo|retorno/.test(t)) return 'cliente';
  return null;
}

/**
 * Retorna histórico formatado para a API Claude (últimas N trocas)
 */
function getHistoricoParaAPI(adminId, telefone, ultimasN = 6) {
  const s = getSession(adminId, telefone);
  // Pega as últimas N*2 mensagens (N trocas user+assistant)
  return s.historico.slice(-(ultimasN * 2));
}

/**
 * Limpa sessão manualmente (ex: após logout)
 */
function clearSession(adminId, telefone) {
  _sessions.delete(_chave(adminId, telefone));
}

/**
 * Trava financeira: valida se valor mudou sem recálculo
 * Retorna true se valores são consistentes
 */
function validarCoerenciaFinanceira(adminId, telefone, novosDados) {
  const s = getSession(adminId, telefone);
  if (!s.ultimoValorFinanceiro) return true; // primeira vez
  const ant = s.ultimoValorFinanceiro;
  const delta = Math.abs((novosDados.entradas || 0) - (ant.entradas || 0));
  // Se entradas mudaram mais de R$1 sem ser nova consulta, flag inconsistência
  if (delta > 1 && !novosDados.novaConsulta) {
    console.warn('[SessionManager] INCONSISTÊNCIA FINANCEIRA detectada:', ant, '->', novosDados);
    return false;
  }
  return true;
}

module.exports = {
  getSession,
  addUserMsg,
  addAssistantMsg,
  updateSession,
  isConfirmacao,
  isNegacao,
  detectarAssunto,
  getHistoricoParaAPI,
  clearSession,
  validarCoerenciaFinanceira
};
