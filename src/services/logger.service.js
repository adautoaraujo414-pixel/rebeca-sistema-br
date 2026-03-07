// Logger centralizado — substitui console.log espalhado
// Níveis: error > warn > info > debug
// Em produção (NODE_ENV=production): só error e warn aparecem no Render
// Em dev: tudo aparece

const NIVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');
const NIVEIS = { error: 0, warn: 1, info: 2, debug: 3 };
const NIVEL_NUM = NIVEIS[NIVEL] ?? 3;

function formatar(nivel, modulo, msg, extra) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const base = `[${ts}] [${nivel.toUpperCase()}] [${modulo}] ${msg}`;
    return extra ? base + ' ' + JSON.stringify(extra) : base;
}

function criar(modulo) {
    return {
        error: (msg, extra) => {
            if (NIVEL_NUM >= 0) console.error(formatar('error', modulo, msg, extra));
        },
        warn: (msg, extra) => {
            if (NIVEL_NUM >= 1) console.warn(formatar('warn', modulo, msg, extra));
        },
        info: (msg, extra) => {
            if (NIVEL_NUM >= 2) console.log(formatar('info', modulo, msg, extra));
        },
        debug: (msg, extra) => {
            if (NIVEL_NUM >= 3) console.log(formatar('debug', modulo, msg, extra));
        }
    };
}

// Logger padrão para uso rápido
const logger = criar('APP');
logger.criar = criar;

module.exports = logger;
