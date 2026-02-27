const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const CorridaService = require('../services/corrida.service');

// Middleware de autenticação
const auth = async (req, res, next) => {
    try {
        let token = req.headers.authorization;
        if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
        token = token.replace('Bearer ', '').trim();
        
        const motorista = await MotoristaService.buscarPorToken(token);
        if (!motorista) return res.status(401).json({ erro: 'Token inválido' });
        
        req.motorista = motorista;
        next();
    } catch(e) {
        console.error('[AUTH] Erro:', e.message);
        res.status(500).json({ erro: 'Erro de autenticação' });
    }
};

// Login
router.post('/login', async (req, res) => {
    try {
        const { whatsapp, senha } = req.body;
        const resultado = await MotoristaService.login(whatsapp, senha);
        res.json(resultado);
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Perfil
router.get('/perfil', auth, (req, res) => {
    res.json({ motorista: req.motorista });
});

// Atualizar GPS
router.post('/gps', auth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        await MotoristaService.atualizarGPS(req.motorista._id, latitude, longitude);
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Atualizar Status
router.post('/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        await MotoristaService.atualizarStatus(req.motorista._id, status);
        res.json({ sucesso: true, status });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Corridas disponíveis
router.get('/corridas-disponiveis', auth, async (req, res) => {
    try {
        const corridas = await CorridaService.listarPendentes(req.motorista.adminId);
        res.json({ corridas });
    } catch(e) { res.json({ corridas: [] }); }
});

// Aceitar corrida
router.post('/aceitar', auth, async (req, res) => {
    const { corridaId } = req.body;
    try {
        // PROTEÇÃO: Verificar se corrida já foi aceita
        const { Corrida, InstanciaWhatsapp } = require('../models');
        const EvolutionMultiService = require('../services/evolution-multi.service');
        
        // LOCK ATÔMICO - só um motorista consegue aceitar
        const corridaLocked = await Corrida.findOneAndUpdate(
            { _id: corridaId, status: 'pendente' },
            { status: 'aceita', motoristaId: req.motorista._id, motoristaNome: req.motorista.nome || req.motorista.nomeCompleto, aceitaEm: new Date() },
            { new: true }
        );
        if (!corridaLocked) {
            const existente = await Corrida.findById(corridaId);
            console.log('[ACEITAR] Corrida já processada:', corridaId, '- Status:', existente?.status);
            return res.json({ sucesso: true, corrida: existente, mensagem: 'Corrida já aceita por outro motorista' });
        }
        const corrida = corridaLocked;
        
        // Colocar cliente em modo corrida
        try {
            const RebecaService = require('../services/rebeca.service');
            RebecaService.setEtapaConversa(corrida.clienteTelefone, 'em_corrida');
        } catch(e) {}
        
        // ========== NOTIFICAR CLIENTE - SOLUÇÃO ROBUSTA ==========
        if (corrida && corrida.clienteTelefone) {
            const clienteTel = corrida.clienteTelefone;
            console.log('[ACEITAR] Iniciando notificação para:', clienteTel);
            
            // Buscar TODAS as instâncias e tentar cada uma
            const adminIdCorrida = corrida.adminId;
            const queryInstancia = adminIdCorrida ? { adminId: adminIdCorrida } : {};
            const instancias = await InstanciaWhatsapp.find(queryInstancia).sort({ ultimaConexao: -1 });
            console.log('[ACEITAR] Total instancias encontradas:', instancias.length);
            
            if (instancias.length === 0) {
                console.log('[ACEITAR] ERRO CRÍTICO: Nenhuma instância cadastrada!');
            } else {
                // Montar mensagem
                const m = req.motorista;
                const nomeM = m.nomeCompleto || m.nome || 'Motorista';
                const veicM = m.veiculo?.modelo || m.veiculo || '';
                const corM = m.veiculo?.cor || '';
                const placaM = m.veiculo?.placa || m.placa || '';
                const baseUrl = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
                const linkRastreio = baseUrl + '/rastrear/' + corridaId.slice(-8);
                
                const msg = '🚗 *MOTORISTA A CAMINHO!*\n\n' +
                    '👤 *' + nomeM + '*\n' +
                    (veicM ? '🚙 ' + veicM + (corM ? ' ' + corM : '') + '\n' : '') +
                    (placaM ? '🔢 *' + placaM + '*\n' : '') +
                    '\n📍 *Acompanhe:*\n' + linkRastreio;
                
                // Tentar enviar por cada instância até conseguir
                let enviado = false;
                for (const inst of instancias) {
                    console.log('[ACEITAR] Tentando instancia:', inst.nomeInstancia, '- Status:', inst.status);
                    
                    try {
                        const resultado = await EvolutionMultiService.enviarMensagem(inst._id, clienteTel, msg);
                        if (resultado && resultado.sucesso) {
                            console.log('[ACEITAR] ✅ NOTIFICAÇÃO ENVIADA via', inst.nomeInstancia);
                            enviado = true;
                            break;
                        } else {
                            console.log('[ACEITAR] Falhou via', inst.nomeInstancia, ':', resultado?.erro);
                        }
                    } catch (e) {
                        console.log('[ACEITAR] Erro na instancia', inst.nomeInstancia, ':', e.message);
                    }
                }
                
                if (!enviado) {
                    console.log('[ACEITAR] ❌ FALHA: Não conseguiu enviar por nenhuma instância!');
                }
            }
        } else {
            console.log('[ACEITAR] Sem clienteTelefone na corrida');
        }
        
        res.json({ sucesso: true, corrida });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// Iniciar corrida

// Motorista chegou no local - notificar cliente
router.post('/cheguei', auth, async (req, res) => {
    try {
        const { corridaId } = req.body;
        const { Corrida, InstanciaWhatsapp } = require('../models');
        const EvolutionMultiService = require('../services/evolution-multi.service');
        
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return res.json({ erro: 'Corrida não encontrada' });
        
        // Anti-spam: verificar se já notificou recentemente
        if (!global._notificacoesCheguei) global._notificacoesCheguei = new Map();
        // Limpar entradas antigas (>5min) para evitar memory leak
        if (global._notificacoesCheguei.size > 50) {
            const agora = Date.now();
            for (const [k, v] of global._notificacoesCheguei) {
                if (agora - v > 300000) global._notificacoesCheguei.delete(k);
            }
        }
        const chave = corridaId + '_cheguei';
        const ultimaNotif = global._notificacoesCheguei.get(chave);
        
        if (ultimaNotif && (Date.now() - ultimaNotif) < 60000) {
            console.log('[CHEGUEI] Notificação bloqueada (anti-spam)');
            return res.json({ sucesso: true, mensagem: 'Cliente já foi notificado' });
        }
        
        global._notificacoesCheguei.set(chave, Date.now());
        
        // Atualizar status da corrida
        corrida.status = 'aguardando_cliente';
        corrida.motoristaChegouEm = new Date();
        await corrida.save();
        
        // Notificar cliente via WhatsApp
        const instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
        if (instancia && corrida.clienteTelefone) {
            const msg = `🚗 *MOTORISTA CHEGOU!*\n\nSeu motorista *${req.motorista.nomeCompleto}* está te aguardando no local.\n\n📍 Dirija-se ao veículo:\n🚙 ${req.motorista.veiculo?.modelo || ''} ${req.motorista.veiculo?.cor || ''} - ${req.motorista.veiculo?.placa || ''}`;
            await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone, msg);
        }
        
        console.log('[CHEGUEI] Motorista', req.motorista.nomeCompleto, 'chegou na corrida', corridaId);
        res.json({ sucesso: true, mensagem: 'Cliente notificado!' });
    } catch (e) {
        console.error('[CHEGUEI] Erro:', e.message);
        res.json({ erro: e.message });
    }
});

router.post('/iniciar', auth, async (req, res) => {
    const { corridaId } = req.body;
    try {
        const { Corrida } = require('../models');
        // Lock atômico - evita iniciar duas vezes
        const locked = await Corrida.findOneAndUpdate(
            { _id: corridaId, status: { $in: ['aceita', 'aguardando_cliente'] }, motoristaId: req.motorista._id },
            { status: 'em_andamento', iniciadaEm: new Date() },
            { new: true }
        );
        if (!locked) return res.json({ sucesso: false, erro: 'Corrida não pode ser iniciada' });
        const corrida = locked;
        if (corrida && corrida.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            let instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
            if (instancia) {
                await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone,
                    '\u2705 *VIAGEM INICIADA!*\n\nSua corrida comecou. Aproveite o trajeto!\n\nBoa viagem! \ud83d\ude97');
            }
        }
        res.json({ sucesso: true, corrida });
    } catch (e) { res.json({ sucesso: false, erro: e.message }); }
});

// Finalizar corrida
router.post('/finalizar', auth, async (req, res) => {
    const { corridaId, precoFinal } = req.body;
    try {
        const corrida = await CorridaService.finalizar(corridaId, precoFinal);
        const corridaFinal = corrida.corrida || corrida;
        if (corridaFinal && corridaFinal.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            let instancia = await InstanciaWhatsapp.findOne({ adminId: corridaFinal.adminId, status: 'conectado' });
            if (instancia) {
                const valor = precoFinal || corridaFinal.precoFinal || corridaFinal.precoEstimado || 0;
                // Colocar cliente em modo avaliacao
                try { const RebecaService = require('../services/rebeca.service'); RebecaService.pedirAvaliacao(corridaFinal.clienteTelefone); } catch(e) {}
                await EvolutionMultiService.enviarMensagem(instancia._id, corridaFinal.clienteTelefone,
                    '\ud83c\udfc1 *CORRIDA FINALIZADA!*\n\n' +
                    '\ud83d\udcb0 *Valor: R$ ' + valor.toFixed(2) + '*\n\n' +
                    'Obrigada por viajar com a gente! \u2764\ufe0f\n\nQuer avaliar o motorista? Mande uma nota de 1 a 5.');
            }
        }
        res.json(corrida);
    } catch (e) { res.json({ sucesso: false, erro: e.message }); }
});

// Cancelar corrida
router.post('/cancelar', auth, async (req, res) => {
    const { corridaId, motivo } = req.body;
    try {
        const corridaAntes = await CorridaService.buscarPorId(corridaId);
        const resultado = await CorridaService.cancelar(corridaId, motivo || 'Cancelado pelo motorista');
        // Resetar Rebeca para cliente poder pedir nova corrida
        if (corridaAntes && corridaAntes.clienteTelefone) {
            try { const RebecaService = require('../services/rebeca.service'); RebecaService.setEtapaConversa(corridaAntes.clienteTelefone, 'inicio'); } catch(e) {}
        }
        if (corridaAntes && corridaAntes.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            let instancia = await InstanciaWhatsapp.findOne({ adminId: corridaAntes.adminId, status: 'conectado' });
            if (instancia) {
                await EvolutionMultiService.enviarMensagem(instancia._id, corridaAntes.clienteTelefone,
                    '\u274c *CORRIDA CANCELADA*\n\nInfelizmente o motorista precisou cancelar.\n\nQuer que eu busque outro? Mande sua localizacao!');
            }
        }
        res.json(resultado);
    } catch (e) { res.json({ sucesso: false, erro: e.message }); }
});

// Histórico de corridas
router.get('/historico', auth, async (req, res) => {
    try {
        const corridas = await CorridaService.listarPorMotorista(req.motorista._id);
        res.json({ corridas });
    } catch(e) { res.json({ corridas: [] }); }
});

// Corrida ativa
router.get('/corrida-ativa', auth, async (req, res) => {
    try {
        const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
        res.json({ corrida });
    } catch(e) { res.json({ corrida: null }); }
});

// Chat - Enviar mensagem para cliente via WhatsApp
router.post('/chat', auth, async (req, res) => {
    const { texto } = req.body;
    if (!texto) return res.json({ sucesso: false, erro: 'Texto vazio' });
    
    try {
        // Buscar corrida ativa do motorista
        const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
        if (!corrida || !corrida.clienteTelefone) {
            return res.json({ sucesso: false, erro: 'Sem corrida ativa' });
        }
        if (['finalizada', 'cancelada'].includes(corrida.status)) {
            return res.json({ sucesso: false, erro: 'Corrida encerrada. Chat desativado.' });
        }
        
        // Enviar via WhatsApp para o cliente
        const EvolutionMultiService = require('../services/evolution-multi.service');
        const { InstanciaWhatsapp } = require('../models');
        const instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
        
        if (instancia) {
            const msgCliente = '🚗 *Mensagem do motorista ' + (req.motorista.nomeCompleto || req.motorista.nome) + ':*\n\n' + texto;
            await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone, msgCliente);
        }
        
        const novaMensagem = { texto, remetente: req.motorista._id, nomeRemetente: req.motorista.nomeCompleto || req.motorista.nome, data: new Date(), tipo: 'motorista' };
        const { Corrida } = require('../models');
        await Corrida.findByIdAndUpdate(corrida._id, { $push: { chatMensagens: novaMensagem } });
        res.json({ sucesso: true, mensagens: [novaMensagem] });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// Chat - Buscar mensagens
router.get('/chat', auth, async (req, res) => {
    try {
        const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
        res.json({ sucesso: true, mensagens: corrida?.chatMensagens || [] });
    } catch (e) {
        res.json({ sucesso: true, mensagens: [] });
    }
});


// Rota white-label: /m/:slug (ex: /m/ubmax)
router.get('/m/:slug', async (req, res) => {
    try {
        const { Admin } = require('../models');
        const admin = await Admin.findOne({ 
            $or: [
                { slugMotorista: req.params.slug.toLowerCase() },
                { nomeMarca: new RegExp('^' + req.params.slug + '$', 'i') }
            ]
        });
        
        if (!admin) {
            return res.status(404).send('Empresa não encontrada');
        }
        
        // Redireciona para o app do motorista com adminId
        res.redirect('/motorista-app.html?admin=' + admin._id + '&marca=' + encodeURIComponent(admin.nomeMarca || 'UBMAX'));
    } catch (e) {
        res.status(500).send('Erro: ' + e.message);
    }
});

module.exports = router;
