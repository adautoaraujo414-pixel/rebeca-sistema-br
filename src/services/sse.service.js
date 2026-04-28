/**
 * SSE SERVICE — Server-Sent Events para notificação em tempo real
 * Usado para: novo pedido → admin recebe → imprime automaticamente
 * Sem dependências externas — funciona com Express puro
 */

const _clientes = new Map(); // adminId -> Set de res

const SseService = {
    // Registrar cliente (admin conectado)
    registrar(adminId, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Heartbeat a cada 25s para manter conexão viva
        const hb = setInterval(() => {
            try { res.write(': ping\n\n'); } catch(e) { clearInterval(hb); }
        }, 25000);

        if (!_clientes.has(adminId)) _clientes.set(adminId, new Set());
        _clientes.get(adminId).add(res);

        res.on('close', () => {
            clearInterval(hb);
            const set = _clientes.get(adminId);
            if (set) { set.delete(res); if (!set.size) _clientes.delete(adminId); }
        });
    },

    // Emitir evento para todos os admins conectados de um adminId
    emitir(adminId, evento, dados) {
        const set = _clientes.get(adminId?.toString());
        if (!set || !set.size) return;
        const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
        set.forEach(res => {
            try { res.write(payload); } catch(e) {}
        });
    }
};

module.exports = SseService;
