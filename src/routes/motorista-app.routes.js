const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const CorridaService = require('../services/corrida.service');

// Middleware de autenticação
const auth = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    
    const motorista = await MotoristaService.buscarPorToken(token);
    if (!motorista) return res.status(401).json({ erro: 'Token inválido' });
    
    req.motorista = motorista;
    next();
};

// Login
router.post('/login', async (req, res) => {
    const { whatsapp, senha } = req.body;
    const resultado = await MotoristaService.login(whatsapp, senha);
    res.json(resultado);
});

// Perfil
router.get('/perfil', auth, (req, res) => {
    res.json({ motorista: req.motorista });
});

// Atualizar GPS
router.post('/gps', auth, async (req, res) => {
    const { latitude, longitude } = req.body;
    await MotoristaService.atualizarGPS(req.motorista._id, latitude, longitude);
    res.json({ sucesso: true });
});

// Atualizar Status
router.post('/status', auth, async (req, res) => {
    const { status } = req.body;
    await MotoristaService.atualizarStatus(req.motorista._id, status);
    res.json({ sucesso: true, status });
});

// Corridas disponíveis
router.get('/corridas-disponiveis', auth, async (req, res) => {
    const corridas = await CorridaService.listarPendentes(req.motorista.adminId);
    res.json({ corridas });
});

// Aceitar corrida
router.post('/aceitar', auth, async (req, res) => {
    const { corridaId } = req.body;
    try {
        // PROTEÇÃO: Verificar se corrida já foi aceita
        const { Corrida, InstanciaWhatsapp } = require('../models');
        const EvolutionMultiService = require('../services/evolution-multi.service');
        
        const corridaExistente = await Corrida.findById(corridaId);
        if (!corridaExistente) {
            return res.status(404).json({ erro: 'Corrida não encontrada' });
        }
        if (corridaExistente.status !== 'pendente') {
            console.log('[ACEITAR] Corrida já processada:', corridaId, '- Status:', corridaExistente.status);
            return res.json({ sucesso: true, corrida: corridaExistente, mensagem: 'Corrida já aceita' });
        }
        
        const corrida = await CorridaService.atribuirMotorista(corridaId, req.motorista._id, req.motorista.nome);
        
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
            const instancias = await InstanciaWhatsapp.find({}).sort({ ultimaConexao: -1 });
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
        const corrida = await CorridaService.iniciar(corridaId);
        if (corrida && corrida.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            let instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
            if (!instancia) instancia = await InstanciaWhatsapp.findOne({ status: 'conectado' });
            if (instancia) {
                await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone,
                    '\u2705 *MOTORISTA CHEGOU!*\n\nSeu motorista esta no local. Dirija-se ao veiculo.\n\nBoa viagem! \ud83d\ude97');
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
            if (!instancia) instancia = await InstanciaWhatsapp.findOne({ status: 'conectado' });
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
        if (corridaAntes && corridaAntes.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            let instancia = await InstanciaWhatsapp.findOne({ adminId: corridaAntes.adminId, status: 'conectado' });
            if (!instancia) instancia = await InstanciaWhatsapp.findOne({ status: 'conectado' });
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
    const corridas = await CorridaService.listarPorMotorista(req.motorista._id);
    res.json({ corridas });
});

// Corrida ativa
router.get('/corrida-ativa', auth, async (req, res) => {
    const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
    res.json({ corrida });
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
        
        // Enviar via WhatsApp para o cliente
        const EvolutionMultiService = require('../services/evolution-multi.service');
        const { InstanciaWhatsapp } = require('../models');
        const instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
        
        if (instancia) {
            const msgCliente = '🚗 *Mensagem do motorista ' + (req.motorista.nomeCompleto || req.motorista.nome) + ':*\n\n' + texto;
            await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone, msgCliente);
        }
        
        res.json({ sucesso: true, mensagens: [{ texto, remetente: req.motorista._id, nomeRemetente: req.motorista.nome, data: new Date() }] });
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

module.exports = router;

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
