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

// Helper: buscar instância WhatsApp com fallback global
async function _buscarInstancia(corrida) {
    const { InstanciaWhatsapp } = require('../models');
    let inst = null;
    // 1. instanciaId salvo na corrida (mais confiável)
    if (corrida?.instanciaId) inst = await InstanciaWhatsapp.findById(corrida.instanciaId).catch(() => null);
    // 2. Buscar pelo mapa de conversas da Rebeca (telefone do cliente)
    if (!inst && corrida?.clienteTelefone) {
        try {
            const RebecaSvc = require('../services/rebeca.service');
            const _tels = [corrida.clienteTelefone, '55'+corrida.clienteTelefone, corrida.clienteTelefone.replace(/^55/,'')];
            for (const _t of _tels) {
                const _cv = RebecaSvc.conversas?.get(_t);
                if (_cv && _cv.instanciaId) {
                    inst = await InstanciaWhatsapp.findById(_cv.instanciaId).catch(() => null);
                    if (inst) { console.log('[INST] via conversa cliente:', inst.nomeInstancia); break; }
                }
            }
        } catch(_e) {}
    }
    // 3. adminId da corrida — busca todas instâncias do admin e loga
    if (!inst && corrida?.adminId) {
        const _todas = await InstanciaWhatsapp.find({ adminId: corrida.adminId }).lean().catch(() => []);
        console.log('[INST] adminId corrida:', corrida.adminId, '| instâncias do admin:', _todas.map(i => i.nomeInstancia + '(' + i.status + ')'));
        inst = _todas.find(i => ['conectado','open','connected','ativo','active'].includes(i.status)) || _todas[0] || null;
        if (inst) inst = await InstanciaWhatsapp.findById(inst._id).catch(() => null);
    }
    // SEM fallback cross-admin — não usar instância de outro admin
    if (inst) console.log('[INST] usando:', inst.nomeInstancia);
    else console.log('[INST] NENHUMA instância encontrada para adminId:', corrida?.adminId);
    return inst;
}

router.post('/login', async (req, res) => {
    try {
        const { whatsapp, senha } = req.body;
        const resultado = await MotoristaService.login(whatsapp, senha);
        res.json(resultado);
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Perfil
router.get('/perfil', auth, async (req, res) => {
    try {
        res.json({ motorista: req.motorista });
    } catch(e) { res.status(500).json({ erro: e.message }); }
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
        // PROTEÇÃO: Verificar blacklist do cliente
        try { const { Corrida: _CB } = require('../models'); const _cB = await _CB.findById(corridaId).select('clienteTelefone'); if (_cB?.clienteTelefone) { const AF = require('../services/antifraude.service'); const _bl = AF.verificarBlacklist('telefone', _cB.clienteTelefone); if (_bl) return res.json({ sucesso: false, erro: 'Corrida bloqueada — cliente na blacklist.' }); } } catch(_baf) {}
        // PROTEÇÃO: Verificar inadimplência
        if (req.motorista.bloqueadoPorMensalidade || req.motorista.ativo === false) {
            return res.json({ sucesso: false, erro: 'Sua conta está bloqueada por mensalidade em atraso. Entre em contato com o administrador.' });
        }
        // PROTEÇÃO: Verificar se corrida já foi aceita
        const { Corrida, InstanciaWhatsapp } = require('../models');
        const EvolutionMultiService = require('../services/evolution-multi.service');
        
        // LOCK ATÔMICO - só um motorista consegue aceitar
        const corridaLocked = await Corrida.findOneAndUpdate(
            { _id: corridaId, status: 'pendente' },
            { $set: { status: 'aceita', motoristaId: req.motorista._id, motoristaNome: req.motorista.nome || req.motorista.nomeCompleto, aceitaEm: new Date() },
              $setOnInsert: {} },
            { new: true }
        );
        if (!corridaLocked) {
            const existente = await Corrida.findById(corridaId);
            console.log('[ACEITAR] Corrida já processada:', corridaId, '- Status:', existente?.status);
            return res.json({ sucesso: true, corrida: existente, mensagem: 'Corrida já aceita por outro motorista' });
        }
        // Garantir adminId na corrida para notificações futuras (cheguei/iniciar/finalizar/cancelar)
        if (!corridaLocked.adminId && req.motorista.adminId) {
            await Corrida.findByIdAndUpdate(corridaId, { adminId: req.motorista.adminId });
            corridaLocked.adminId = req.motorista.adminId;
            console.log('[ACEITAR] adminId corrigido na corrida:', req.motorista.adminId);
        }
        const corrida = corridaLocked;
        
        // Colocar cliente em modo motorista_a_caminho (corrida só começa no INICIAR)
        try {
            const RebecaService = require('../services/rebeca.service');
            RebecaService.setEtapaConversa(corrida.clienteTelefone, 'motorista_a_caminho');
        } catch(e) { console.log('[CATCH]', e.message); }

        // Remover corrida dos despachos pendentes em memória
        try {
            const DespachoService = require('../services/despacho.service');
            if (DespachoService.corridasPendentes) {
                DespachoService.corridasPendentes.delete(corridaId.toString());
            }
        } catch(_dp) {}
        
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
                
                const valorCorrida = corrida.precoEstimado || corrida.precoFinal || 0;
                const etaMin = corrida.tempoEstimado || 0;
                const etaTexto = etaMin > 0 ? '⏱️ *Tempo estimado: ~' + etaMin + ' min*\n' : '';
                const msg = '🚗 *MOTORISTA A CAMINHO!*\n\n' +
                    (valorCorrida > 0 ? '💰 *Valor: R$ ' + valorCorrida.toFixed(2) + '*\n' : '') +
                    etaTexto + '\n' +
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
                // Atualizar etapa da conversa do cliente para em_corrida
                try {
                    const RebecaService = require('../services/rebeca.service');
                    const _conversas = RebecaService.conversas;
                    if (_conversas) {
                        const _telsC = [clienteTel, '55'+clienteTel, clienteTel.replace(/^55/,'')];
                        for (const _t of _telsC) {
                            const _cv = _conversas.get(_t);
                            if (_cv) {
                                _cv.etapa = 'em_corrida';
                                _cv.dados = _cv.dados || {};
                                _cv.dados.corridaId = corridaId;
                                _conversas.set(_t, _cv);
                                console.log('[ACEITAR] Etapa cliente -> em_corrida:', _t);
                                break;
                            }
                        }
                    }
                } catch(_eCv) { console.log('[ACEITAR] Erro update etapa:', _eCv.message); }
            }
        } else {
            console.log('[ACEITAR] Sem clienteTelefone na corrida');
        }
        
        // Remover corrida do mapa de pendentes do DespachoService
        try {
            const DespachoService = require('../services/despacho.service');
            if (DespachoService.corridasPendentes) {
                DespachoService.corridasPendentes.delete(corridaId.toString());
                console.log('[ACEITAR] Corrida removida do DespachoService');
            }
        } catch(_dp) {}

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
        if (!corrida.notificacoes) corrida.notificacoes = {};
        corrida.notificacoes.motoristaChegouEnviada = true;
        await corrida.save();

        // Atualizar estado da conversa da Rebeca — cliente está em aguardando_embarque
        try {
            const RebecaService = require('../services/rebeca.service');
            const conversas = RebecaService.conversas;
            if (conversas && corrida.clienteTelefone) {
                const conv = conversas.get(corrida.clienteTelefone) || {};
                conv.etapa = 'aguardando_embarque';
                conv.dados = { ...conv.dados, corridaId: corridaId };
                conv._ultimaAtividade = Date.now();
                conversas.set(corrida.clienteTelefone, conv);
            }
        } catch(_re) { console.log('[CHEGUEI] Rebeca state:', _re.message); }

        // Notificar cliente via WhatsApp — instância correta da corrida
        if (corrida.clienteTelefone) {
            let instCheg = corrida.instanciaId
                ? await InstanciaWhatsapp.findById(corrida.instanciaId).catch(() => null)
                : null;
            if (!instCheg) {
                try {
                    const RebSvc = require('../services/rebeca.service');
                    const _tels = [corrida.clienteTelefone, '55'+corrida.clienteTelefone, corrida.clienteTelefone.replace(/^55/,'')];
                    for (const _t of _tels) {
                        const _cv = RebSvc.conversas?.get(_t);
                        if (_cv && _cv.instanciaId) {
                            instCheg = await InstanciaWhatsapp.findById(_cv.instanciaId).catch(() => null);
                            if (instCheg) break;
                        }
                    }
                } catch(_e) {}
            }
            if (!instCheg) instCheg = await _buscarInstancia(corrida);
            if (instCheg) {
                const nomeM = req.motorista.nomeCompleto || req.motorista.nome || 'Motorista';
                const veic = req.motorista.veiculo?.modelo || '';
                const corV = req.motorista.veiculo?.cor || '';
                const placa = req.motorista.veiculo?.placa || req.motorista.placa || '';
                const msgCheg = '🚗 Boa notícia! *' + nomeM + '* chegou e está te esperando no local!\n\n🚙 ' + veic + ' ' + corV + (placa ? ' — *' + placa + '*' : '');
                await EvolutionMultiService.enviarMensagem(instCheg._id, corrida.clienteTelefone, msgCheg);
                console.log('[CHEGUEI] Notif enviada via', instCheg.nomeInstancia);
            }
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
        // Re-buscar corrida para garantir todos os campos incluindo adminId
        const corrida = await Corrida.findById(locked._id) || locked;
        if (corrida && corrida.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            const instancia = await _buscarInstancia(corrida);
            if (instancia) {
                await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone,
                    '🚗 *Corrida iniciada!*\n\nBoa viagem! 😊');
            }
        }
        // Sincronizar estado Rebeca — em_corrida
        try {
            const RebecaService = require('../services/rebeca.service');
            const conversas = RebecaService.conversas;
            if (conversas && corrida?.clienteTelefone) {
                const conv = conversas.get(corrida.clienteTelefone) || {};
                conv.etapa = 'em_corrida';
                conv.dados = { ...conv.dados, corridaId: corridaId };
                conv._ultimaAtividade = Date.now();
                conversas.set(corrida.clienteTelefone, conv);
            }
        } catch(_rs) {}
        res.json({ sucesso: true, corrida });
    } catch (e) { res.json({ sucesso: false, erro: e.message }); }
});

// Finalizar corrida
router.post('/finalizar', auth, async (req, res) => {
    const { corridaId, precoFinal } = req.body;
    try {
        const corrida = await CorridaService.finalizar(corridaId, precoFinal);
        const corridaFinal = corrida?.corrida || corrida;
        if (corridaFinal && corridaFinal.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            const instancia = await _buscarInstancia(corridaFinal);
            if (instancia) {
                const valor = precoFinal || corridaFinal.precoFinal || corridaFinal.precoEstimado || 0;
                // Colocar cliente em modo avaliacao
                try {
                    const RebecaService = require('../services/rebeca.service');
                    const conversas = RebecaService.conversas;
                    if (conversas && corridaFinal.clienteTelefone) {
                        const conv = conversas.get(corridaFinal.clienteTelefone) || {};
                        conv.etapa = 'avaliar';
                        conv.dados = { ...conv.dados, corridaId: corridaFinal._id?.toString() };
                        conv._ultimaAtividade = Date.now();
                        conversas.set(corridaFinal.clienteTelefone, conv);
                    }
                    // Salvar destino no histórico
                    if (corridaFinal.destino?.endereco) {
                        const ClienteService = require('../services/cliente.service');
                        await ClienteService.salvarDestino(corridaFinal.clienteTelefone, corridaFinal.adminId, corridaFinal.destino);
                    }
                } catch(_re) { console.log('[FINALIZAR] state:', _re.message); }
                await EvolutionMultiService.enviarMensagem(instancia._id, corridaFinal.clienteTelefone,
                    (() => {
                        const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                        const hora = agora.getHours();
                        const saudacao = hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
                        return '🏁 *Corrida encerrada!*\n\n' +
                            (valor > 0 ? '💰 *Valor: R$ ' + valor.toFixed(2).replace('.', ',') + '*\n\n' : '') +
                            saudacao + '! Muito obrigada. 😊';
                    })());
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
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            const instancia = await _buscarInstancia(corridaAntes);
            console.log('[CANCEL] instancia:', instancia ? instancia.nomeInstancia : 'NENHUMA', '| corridaAntes.instanciaId:', corridaAntes?.instanciaId);
            if (instancia) {
                await EvolutionMultiService.enviarMensagem(instancia._id, corridaAntes.clienteTelefone,
                    'Poxa, que situação! 😔 O motorista teve um imprevisto e precisou cancelar sua corrida.\n\nMas não se preocupa, já estou procurando outro pra você! Me manda sua localização que eu chamo na hora 📍🚗');
            }
            // Resetar conversa para o cliente poder pedir de novo normalmente
            try {
                const RebecaService = require('../services/rebeca.service');
                const _telsReset = [corridaAntes.clienteTelefone, '55'+corridaAntes.clienteTelefone, corridaAntes.clienteTelefone.replace(/^55/,'')];
                for (const _t of _telsReset) {
                    const _cv = RebecaService.conversas?.get(_t);
                    if (_cv) {
                        _cv.etapa = 'inicio';
                        _cv.dados = {};
                        RebecaService.conversas.set(_t, _cv);
                        console.log('[CANCEL-MOT] Conversa cliente resetada:', _t);
                        break;
                    }
                }
            } catch(_eReset) { console.log('[CANCEL-MOT] Erro reset conversa:', _eReset.message); }
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
        const instancia = await _buscarInstancia(corrida);
        console.log('[CHAT] instancia:', instancia ? instancia.nomeInstancia : 'NAO ENCONTRADA');
        
        if (instancia) {
            const _nomeM = (req.motorista.nomeCompleto || req.motorista.nome || 'Motorista').split(' ')[0]; const msgCliente = '💬 *Motorista ' + _nomeM + ':* ' + texto;
            const envioResult = await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone, msgCliente);
            console.log('[CHAT] Envio resultado:', JSON.stringify(envioResult));
        } else {
            console.log('[CHAT] FALHA: Nenhuma instancia conectada para adminId:', corrida.adminId);
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


// Reportar avaria
router.post('/avaria', auth, async (req, res) => {
    try {
        const { descricao, latitude, longitude } = req.body;
        const { Admin, InstanciaWhatsapp } = require('../models');
        const EvolutionMultiService = require('../services/evolution-multi.service');
        
        console.log('[AVARIA]', req.motorista.nomeCompleto, ':', descricao);
        
        // Salvar avaria no banco
        try {
            const mongoose = require('mongoose');
            const AvariaSchema = mongoose.models.Avaria || mongoose.model('Avaria', new mongoose.Schema({
                motoristaId: mongoose.Schema.Types.ObjectId,
                motoristaNome: String,
                descricao: String,
                latitude: Number, longitude: Number,
                adminId: mongoose.Schema.Types.ObjectId,
                status: { type: String, default: 'pendente' }
            }, { timestamps: true }));
            await AvariaSchema.create({
                motoristaId: req.motorista._id,
                motoristaNome: req.motorista.nomeCompleto,
                descricao,
                latitude: latitude || null,
                longitude: longitude || null,
                adminId: req.motorista.adminId
            });
        } catch(dbErr) { console.log('[AVARIA] Erro ao salvar:', dbErr.message); }
        
        // Notificar admin via WhatsApp
        const admin = await Admin.findById(req.motorista.adminId);
        if (admin && admin.telefone) {
            const instancia = await InstanciaWhatsapp.findOne({ adminId: admin._id, status: { $in: ['conectado','open','connected'] } });
            if (instancia) {
                const msg = '⚠️ *AVARIA REPORTADA*\n\n' +
                    '👤 Motorista: *' + req.motorista.nomeCompleto + '*\n' +
                    '📝 ' + descricao + '\n' +
                    (latitude ? '📍 Loc: ' + latitude + ',' + longitude : '') +
                    '\n\n_Reportado agora_';
                await EvolutionMultiService.enviarMensagem(instancia._id, admin.telefone, msg);
            }
        }
        
        res.json({ sucesso: true, mensagem: 'Avaria reportada com sucesso' });
    } catch(e) {
        console.error('[AVARIA] Erro:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});


// Estatísticas do motorista
router.get('/estatisticas', auth, async (req, res) => {
    try {
        const { Corrida } = require('../models');
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const corridas = await Corrida.find({
            motoristaId: req.motorista._id,
            status: 'finalizada',
            createdAt: { $gte: hoje }
        });
        
        const ganhosHoje = corridas.reduce((s, c) => s + (c.precoFinal || c.precoEstimado || 0), 0);
        const corridasHoje = corridas.length;
        
        // Calcular horas online (baseado em tempo entre primeira e última corrida do dia)
        let horasOnline = 0;
        if (corridas.length > 0) {
            const primeira = new Date(corridas[0].createdAt);
            const ultima = new Date(corridas[corridas.length-1].updatedAt || corridas[corridas.length-1].createdAt);
            horasOnline = Math.round((ultima - primeira) / 3600000 * 10) / 10;
            if (horasOnline < 0.5 && corridas.length > 0) horasOnline = 0.5;
        }
        
        res.json({ ganhosHoje, corridasHoje, horasOnline });
    } catch(e) {
        res.json({ ganhosHoje: 0, corridasHoje: 0, horasOnline: 0 });
    }
});


// Relatório por período
router.get('/relatorio', auth, async (req, res) => {
    try {
        const { Corrida } = require('../models');
        const periodo = req.query.periodo || 'hoje';
        const agora = new Date();
        let desde = new Date();
        
        if (periodo === 'hoje') desde.setHours(0,0,0,0);
        else if (periodo === 'semana') desde.setDate(agora.getDate() - 7);
        else if (periodo === 'mes') desde.setMonth(agora.getMonth() - 1);
        
        const corridas = await Corrida.find({
            motoristaId: req.motorista._id,
            status: 'finalizada',
            createdAt: { $gte: desde }
        });
        
        const faturamento = corridas.reduce((s, c) => s + (c.precoFinal || c.precoEstimado || 0), 0);
        const media = corridas.length > 0 ? faturamento / corridas.length : 0;
        
        let horas = 0;
        if (corridas.length > 0) {
            const primeira = new Date(corridas[0].createdAt);
            const ultima = new Date(corridas[corridas.length-1].updatedAt || corridas[corridas.length-1].createdAt);
            horas = Math.round((ultima - primeira) / 3600000 * 10) / 10;
        }
        
        res.json({ corridas: corridas.length, faturamento, media, horas });
    } catch(e) {
        res.json({ corridas: 0, faturamento: 0, media: 0, horas: 0 });
    }
});


// Salvar avaliação do cliente
router.post('/avaliar', auth, async (req, res) => {
    try {
        const { corridaId, nota } = req.body;
        const { Corrida } = require('../models');
        if (!corridaId || !nota || nota < 1 || nota > 5) {
            return res.json({ sucesso: false, erro: 'Dados inválidos' });
        }
        await Corrida.findByIdAndUpdate(corridaId, { avaliacao: nota }, { new: true });
        
        // Atualizar média do motorista
        const corridas = await Corrida.find({ motoristaId: req.motorista._id, avaliacao: { $exists: true, $gt: 0 } });
        if (corridas.length > 0) {
            const media = corridas.reduce((s, c) => s + c.avaliacao, 0) / corridas.length;
            const Motorista = require('../models').Motorista;
            await Motorista.findByIdAndUpdate(req.motorista._id, { avaliacao: Math.round(media * 10) / 10 }, { new: true });
        }
        
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});


// Push: obter VAPID public key
router.get('/push/vapid-key', (req, res) => {
    try {
        const PushService = require('../services/push.service');
        res.json({ key: PushService.VAPID_PUBLIC || null });
    } catch(e) {
        res.json({ key: null });
    }
});

// Push: salvar subscription
router.post('/push/subscribe', auth, async (req, res) => {
    try {
        const PushService = require('../services/push.service');
        PushService.salvarSubscription(req.motorista._id, req.body.subscription);
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});


// Chat: motorista busca mensagens do cliente
router.get('/chat/mensagens', auth, async (req, res) => {
    try {
        const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
        if (!corrida) return res.json({ mensagens: [] });
        
        const { Corrida } = require('../models');
        const corridaFull = await Corrida.findById(corrida._id).select('chatMensagens');
        const msgs = corridaFull?.chatMensagens || [];
        
        // Retornar últimas 20 mensagens
        res.json({ mensagens: msgs.slice(-20) });
    } catch(e) { res.json({ mensagens: [] }); }
});

// Recusar corrida — aciona redespacho automático
router.post('/recusar', auth, async (req, res) => {
    const { corridaId, motivo } = req.body;
    try {
        const { Corrida, Motorista } = require('../models');
        const DespachoService = require('../services/despacho.service');

        // Verificar se corrida pertence a este motorista
        const corrida = await Corrida.findOne({
            _id: corridaId,
            motoristaId: req.motorista._id,
            status: { $in: ['pendente', 'aceita', 'motorista_a_caminho'] }
        });
        if (!corrida) return res.json({ sucesso: false, erro: 'Corrida nao encontrada' });

        // Liberar motorista
        await Motorista.findByIdAndUpdate(req.motorista._id, { status: 'disponivel' });

        // Acionar redespacho — DespachoService tenta proximo da lista
        const resultado = DespachoService.recusarCorrida(corridaId, req.motorista._id.toString(), motivo || 'Recusado pelo motorista');

        if (resultado.redirecionado && resultado.novoMotorista) {
            // Tem proximo motorista — notificar via GPS/push
            try {
                const GPSIntegradoService = require('../services/gps-integrado.service');
                const corridaAtual = await Corrida.findById(corridaId);
                const novoMot = await require('../services/motorista.service').buscarPorId(resultado.novoMotorista.id);
                if (novoMot && corridaAtual) {
                    await GPSIntegradoService.notificarMotorista(novoMot, corridaAtual);
                }
            } catch(_gps) { console.log('[RECUSAR] Erro notif GPS:', _gps.message); }
            return res.json({ sucesso: true, redirecionado: true, mensagem: 'Corrida repassada para outro motorista' });
        }

        if (resultado.semMotoristas) {
            // Sem mais alternativas — cancelar corrida e avisar cliente
            await Corrida.findByIdAndUpdate(corridaId, {
                status: 'cancelada',
                motivoCancelamento: 'sem_motoristas_disponiveis'
            });
            try {
                const { InstanciaWhatsapp } = require('../models');
                const EvolutionMultiService = require('../services/evolution-multi.service');
                const corridaCanc = await Corrida.findById(corridaId);
                if (corridaCanc) {
                    const inst = corridaCanc.instanciaId
                        ? await InstanciaWhatsapp.findById(corridaCanc.instanciaId)
                        : await InstanciaWhatsapp.findOne({ adminId: corridaCanc.adminId, status: { $in: ['conectado','open','connected'] } });
                    if (inst && corridaCanc.clienteTelefone) {
                        await EvolutionMultiService.enviarMensagem(
                            inst._id, corridaCanc.clienteTelefone,
                            'Poxa, nao encontramos nenhum motorista disponivel agora.\n\nTente novamente daqui a pouco! Quando precisar e so chamar.'
                        );
                        // Resetar conversa do cliente
                        const RebecaService = require('../services/rebeca.service');
                        const conversas = RebecaService.conversas;
                        if (conversas && corridaCanc.clienteTelefone) {
                            const conv = conversas.get(corridaCanc.clienteTelefone) || {};
                            conv.etapa = 'oferecer_fila_espera';
                            conv._ultimaAtividade = Date.now();
                            conversas.set(corridaCanc.clienteTelefone, conv);
                        }
                    }
                }
            } catch(_ce) { console.log('[RECUSAR] Erro cancelar:', _ce.message); }
        }

        res.json({ sucesso: true, mensagem: 'Corrida recusada' });
    } catch(e) {
        console.error('[RECUSAR] Erro:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});

// Caixa financeira do motorista — registro de entradas/saídas do dia
router.post('/caixa', auth, async (req, res) => {
    try {
        const { tipo, valor, descricao } = req.body;
        if (!tipo || !valor || isNaN(valor)) return res.json({ sucesso: false, erro: 'Dados inválidos' });
        const { Motorista } = require('../models');
        const entrada = {
            tipo: tipo === 'entrada' ? 'entrada' : 'saida',
            valor: parseFloat(valor),
            descricao: descricao || (tipo === 'entrada' ? 'Entrada' : 'Saída'),
            data: new Date()
        };
        await Motorista.findByIdAndUpdate(req.motorista._id, {
            $push: { caixaDia: entrada }
        });
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

router.get('/caixa', auth, async (req, res) => {
    try {
        const { Motorista } = require('../models');
        const m = await Motorista.findById(req.motorista._id).lean();
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const transacoes = (m.caixaDia || []).filter(t => new Date(t.data) >= hoje);
        const saldo = transacoes.reduce((s, t) => t.tipo === 'entrada' ? s + t.valor : s - t.valor, 0);
        // Adicionar corridas do dia como entradas automáticas
        const { Corrida } = require('../models');
        const corridasHoje = await Corrida.find({
            motoristaId: req.motorista._id,
            status: 'finalizada',
            finalizadaEm: { $gte: hoje }
        }).lean();
        const corridasTransacoes = corridasHoje.map(c => ({
            tipo: 'entrada',
            valor: c.precoFinal || c.precoEstimado || 0,
            descricao: 'Corrida — ' + (c.clienteNome || 'Cliente'),
            data: c.finalizadaEm || c.updatedAt,
            auto: true
        }));
        const todasTransacoes = [...corridasTransacoes, ...transacoes]
            .sort((a,b) => new Date(b.data) - new Date(a.data));
        const saldoTotal = saldo + corridasHoje.reduce((s,c) => s + (c.precoFinal || c.precoEstimado || 0), 0);
        res.json({ sucesso: true, saldo: saldoTotal, transacoes: todasTransacoes });
    } catch(e) { res.json({ sucesso: false, saldo: 0, transacoes: [] }); }
});

module.exports = router;
