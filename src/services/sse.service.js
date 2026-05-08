/**
 * SSE SERVICE — Server-Sent Events para notificação em tempo real
 * Canal admin: novo pedido, pedido_pronto, alertas
 * Canal entregador: novo_pedido_disponivel (por token do entregador)
 */

const _clientes = new Map();      // adminId -> Set de res
const _entregadores = new Map();  // token -> res
const _timersAlerta = new Map();  // pedidoId -> setTimeout

const SseService = {
    registrar(adminId, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const hb = setInterval(() => {
            try { res.write(': ping\n\n'); } catch(e) { clearInterval(hb); }
        }, 15000);
        if (!_clientes.has(adminId)) _clientes.set(adminId, new Set());
        _clientes.get(adminId).add(res);
        res.on('close', () => {
            clearInterval(hb);
            const set = _clientes.get(adminId);
            if (set) { set.delete(res); if (!set.size) _clientes.delete(adminId); }
        });
    },

    registrarEntregador(token, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const hb = setInterval(() => {
            try { res.write(': ping\n\n'); } catch(e) { clearInterval(hb); }
        }, 15000);
        _entregadores.set(token, res);
        res.on('close', () => {
            clearInterval(hb);
            _entregadores.delete(token);
        });
    },

    emitir(adminId, evento, dados) {
        const set = _clientes.get(adminId?.toString());
        if (!set || !set.size) return;
        const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
        set.forEach(res => { try { res.write(payload); } catch(e) {} });
    },

    // Emite para TODOS entregadores de um adminId (token list)
    emitirParaEntregadores(tokens, evento, dados) {
        const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
        tokens.forEach(token => {
            const res = _entregadores.get(token);
            if (res) try { res.write(payload); } catch(e) {}
        });
    },

    // Timer: se nenhum entregador aceitar em X ms, avisa admin
    iniciarTimerAlerta(pedidoId, adminId, segundos, callback) {
        this.cancelarTimerAlerta(pedidoId);
        const t = setTimeout(() => {
            this.emitir(adminId.toString(), 'entregador_sem_resposta', {
                pedidoId,
                mensagem: `⚠️ Nenhum entregador aceitou o pedido em ${segundos}s!`
            });
            if (callback) callback();
        }, segundos * 1000);
        _timersAlerta.set(pedidoId.toString(), t);
    },

    cancelarTimerAlerta(pedidoId) {
        const t = _timersAlerta.get(pedidoId?.toString());
        if (t) { clearTimeout(t); _timersAlerta.delete(pedidoId.toString()); }
    },

    entregadorConectado(token) {
        return _entregadores.has(token);
    }
};

module.exports = SseService;
