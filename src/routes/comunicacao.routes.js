const express = require('express');
const router = express.Router();
const { MensagemCorrida, Corrida, Motorista } = require('../models');

// Motorista envia mensagem para cliente (via Rebeca)
router.post('/motorista-para-cliente', async (req, res) => {
    try {
        const { corridaId, mensagem, motoristaToken } = req.body;
        
        const motorista = await Motorista.findOne({ token: motoristaToken });
        if (!motorista) return res.status(401).json({ erro: 'Motorista não encontrado' });
        
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return res.status(404).json({ erro: 'Corrida não encontrada' });
        if (corrida.adminId && motorista.adminId && corrida.adminId.toString() !== motorista.adminId.toString()) {
            return res.status(403).json({ erro: 'Acesso negado' });
        }
        
        // Bloquear apenas se corrida já finalizada/cancelada
        if (['finalizada', 'cancelada'].includes(corrida.status)) {
            return res.status(400).json({ erro: 'Corrida já encerrada' });
        }
        
        // Salvar mensagem do motorista
        const msg = await MensagemCorrida.create({
            corridaId,
            remetente: 'motorista',
            destinatario: 'cliente',
            mensagem
        });
        
        // Aqui Rebeca enviaria via WhatsApp para o cliente
        // Por enquanto, simula a entrega
        const _nomeMotFmt = motorista.nomeCompleto?.split(' ')[0] || 'Motorista';
        const mensagemRebeca = `💬 *${_nomeMotFmt}:* ${mensagem}`;
        
        // Enviar via WhatsApp real
        try {
            const { InstanciaWhatsapp } = require('../models');
            const EvolutionMultiService = require('../services/evolution-multi.service');
            // Buscar instância: primeiro pelo adminId, depois qualquer conectada
            // Usar instanciaId da corrida para garantir que vai no mesmo número do cliente
            // 1. instanciaId salvo na corrida
            let inst = corrida.instanciaId
                ? await InstanciaWhatsapp.findById(corrida.instanciaId).catch(() => null)
                : null;
            // 2. Fallback: buscar pelo mapa de conversas da Rebeca
            if (!inst) {
                try {
                    const RebecaSvc = require('../services/rebeca.service');
                    const _tels = [corrida.clienteTelefone, '55'+corrida.clienteTelefone, corrida.clienteTelefone.replace(/^55/,'')];
                    for (const _t of _tels) {
                        const _cv = RebecaSvc.conversas?.get(_t);
                        if (_cv && _cv.instanciaId) {
                            inst = await InstanciaWhatsapp.findById(_cv.instanciaId).catch(() => null);
                            if (inst) { console.log('[CHAT] instancia via conversa:', inst.nomeInstancia); break; }
                        }
                    }
                } catch(_e) {}
            }
            // 3. Fallback: mesma instância do adminId
            if (!inst) inst = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: { $in: ['conectado','open','connected'] } });
            console.log('[CHAT] instanciaId da corrida:', corrida.instanciaId, '| instância encontrada:', inst ? inst.nomeInstancia : 'NENHUMA');
            if (inst) {
                console.log('[CHAT] Tentando enviar para:', corrida.clienteTelefone, '| inst._id:', inst._id, '| msg:', mensagemRebeca);
                await EvolutionMultiService.enviarMensagem(inst._id, corrida.clienteTelefone, mensagemRebeca);
                console.log('[CHAT] ✅ Mensagem enviada ao cliente via WhatsApp:', corrida.clienteTelefone);
            } else {
                console.log('[CHAT] Sem instância conectada para enviar ao cliente');
            }
        } catch(wppErr) {
            console.log('[CHAT] Erro ao enviar WhatsApp:', wppErr.message, wppErr.stack);
        }

        await MensagemCorrida.findByIdAndUpdate(msg._id, { entregue: true }, { new: true });
        
        // Push notification pro motorista
        try {
            const PushService = require('../services/push.service');
            await PushService.notificarMotorista(motorista._id, {
                titulo: '💬 Mensagem do Cliente',
                corpo: (corrida.clienteNome || 'Cliente') + ': ' + mensagem.substring(0, 80),
                tipo: 'chat_cliente',
                corridaId: corridaId
            });
        } catch(_p) { console.log('[CHAT] Push motorista erro:', _p.message); }

        res.json({ 
            sucesso: true, 
            mensagem: 'Mensagem enviada via Rebeca!',
            msg 
        });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Cliente responde (Rebeca recebe e repassa para motorista)
router.post('/cliente-para-motorista', async (req, res) => {
    try {
        const { corridaId, mensagem, clienteTelefone } = req.body;
        
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return res.status(404).json({ erro: 'Corrida não encontrada' });
        
        // Salvar mensagem do cliente
        const msg = await MensagemCorrida.create({
            corridaId,
            remetente: 'cliente',
            destinatario: 'motorista',
            mensagem
        });

        // Enviar WhatsApp ao motorista
        try {
            const { InstanciaWhatsapp, Motorista } = require('../models');
            const EvolutionMultiService = require('../services/evolution-multi.service');
            if (corrida.motoristaId) {
                const motorista = await Motorista.findById(corrida.motoristaId);
                if (motorista && motorista.whatsapp) {
                    let inst = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: { $in: ['conectado','open','connected'] } });
                    if (!inst) inst = await InstanciaWhatsapp.findOne({ status: { $in: ['conectado','open','connected'] } });
                    if (inst) {
                        const nomeCliente = corrida.clienteNome || 'Cliente';
                        const msgMotorista = '💬 *' + nomeCliente + ':* ' + mensagem + '\n_Responda pelo app._';
                        await EvolutionMultiService.enviarMensagem(inst._id, motorista.whatsapp, msgMotorista);
                        console.log('[CHAT] ✅ Mensagem do cliente enviada ao motorista:', motorista.whatsapp);
                    }
                }
            }
        } catch(e) { console.log('[CHAT] Erro enviar motorista:', e.message); }

        res.json({ sucesso: true, msg });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Rebeca envia mensagem automática
router.post('/rebeca-envia', async (req, res) => {
    try {
        const { corridaId, destinatario, mensagem } = req.body;
        
        const msg = await MensagemCorrida.create({
            corridaId,
            remetente: 'rebeca',
            destinatario,
            mensagem,
            entregue: true
        });
        
        res.json({ sucesso: true, msg });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Buscar mensagens de uma corrida
router.get('/corrida/:corridaId', async (req, res) => {
    try {
        const mensagens = await MensagemCorrida.find({ 
            corridaId: req.params.corridaId 
        }).sort({ createdAt: 1 });
        
        res.json(mensagens);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Buscar mensagens não lidas do motorista
router.get('/nao-lidas/:corridaId', async (req, res) => {
    try {
        const mensagens = await MensagemCorrida.find({ 
            corridaId: req.params.corridaId,
            destinatario: 'motorista',
            lida: false
        });
        
        res.json(mensagens);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Marcar como lida
router.post('/marcar-lida/:msgId', async (req, res) => {
    try {
        await MensagemCorrida.findByIdAndUpdate(req.params.msgId, { lida: true }, { new: true });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Mensagens rápidas pré-definidas
router.get('/mensagens-rapidas', (req, res) => {
    res.json([
        { id: 1, texto: 'Estou chegando!' },
        { id: 2, texto: 'Pode descer, estou na frente.' },
        { id: 3, texto: 'Qual o ponto de referência?' },
        { id: 4, texto: 'Não consigo localizar o endereço.' },
        { id: 5, texto: 'Aguarde um momento, por favor.' },
        { id: 6, texto: 'Estou de carro (modelo/cor).' },
        { id: 7, texto: 'Pode me confirmar o destino?' },
        { id: 8, texto: 'Chego em aproximadamente X minutos.' }
    ]);
});

module.exports = router;
