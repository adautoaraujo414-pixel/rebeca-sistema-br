const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const CorridaService = require('../services/corrida.service');
const GPSIntegradoService = require('../services/gps-integrado.service');

// Middleware de autenticação do motorista
const autenticarMotorista = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const motorista = MotoristaService.autenticarPorToken(token);
    
    if (!motorista) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    
    if (!motorista.ativo) {
        return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }
    
    req.motorista = motorista;
    req.motoristaId = motorista.id;
    next();
};

// ==================== AUTENTICAÇÃO ====================

// Login com WhatsApp e senha
router.post('/login', (req, res) => {
    const { whatsapp, senha } = req.body;
    
    if (!whatsapp || !senha) {
        return res.status(400).json({ error: 'WhatsApp e senha são obrigatórios' });
    }
    
    const motorista = MotoristaService.autenticar(whatsapp, senha);
    
    if (!motorista) {
        return res.status(401).json({ error: 'WhatsApp ou senha incorretos' });
    }
    
    res.json({
        sucesso: true,
        token: motorista.token,
        motorista: {
            id: motorista.id,
            nomeCompleto: motorista.nomeCompleto,
            whatsapp: motorista.whatsapp,
            veiculo: motorista.veiculo,
            avaliacao: motorista.avaliacao,
            status: motorista.status
        }
    });
});

// Verificar token
router.get('/verificar-token', autenticarMotorista, (req, res) => {
    res.json({
        sucesso: true,
        motorista: MotoristaService.obterDadosIndividuais(req.motoristaId)
    });
});

// ==================== DADOS DO MOTORISTA ====================

// Meus dados (somente do motorista logado)
router.get('/meus-dados', autenticarMotorista, (req, res) => {
    const dados = MotoristaService.obterDadosIndividuais(req.motoristaId);
    res.json(dados);
});

// Atualizar meus dados
router.put('/meus-dados', autenticarMotorista, (req, res) => {
    const { endereco, veiculo } = req.body;
    
    // Motorista só pode atualizar alguns campos próprios
    const dadosPermitidos = {};
    if (endereco) dadosPermitidos.endereco = endereco;
    if (veiculo) {
        dadosPermitidos.veiculo = {
            modelo: veiculo.modelo,
            cor: veiculo.cor,
            placa: veiculo.placa,
            ano: veiculo.ano
        };
    }
    
    const motorista = MotoristaService.atualizar(req.motoristaId, dadosPermitidos);
    res.json({ sucesso: true, motorista: MotoristaService.obterDadosIndividuais(req.motoristaId) });
});

// Alterar minha senha
router.put('/alterar-senha', autenticarMotorista, (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    
    if (!novaSenha || novaSenha.length < 4) {
        return res.status(400).json({ error: 'Nova senha deve ter pelo menos 4 caracteres' });
    }
    
    // Verifica senha atual
    const motorista = MotoristaService.autenticar(req.motorista.whatsapp, senhaAtual);
    if (!motorista) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    
    MotoristaService.alterarSenha(req.motoristaId, novaSenha);
    res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso' });
});

// ==================== STATUS E LOCALIZAÇÃO ====================

// Atualizar minha localização
router.post('/atualizar-localizacao', autenticarMotorista, (req, res) => {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude e longitude são obrigatórios' });
    }
    
    GPSIntegradoService.atualizar(req.motoristaId, { latitude, longitude });
    
    res.json({ sucesso: true, mensagem: 'Localização atualizada' });
});

// Ficar disponível
router.post('/ficar-disponivel', autenticarMotorista, (req, res) => {
    MotoristaService.atualizarStatus(req.motoristaId, 'disponivel');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'disponivel' });
    
    res.json({ sucesso: true, status: 'disponivel' });
});

// Ficar offline
router.post('/ficar-offline', autenticarMotorista, (req, res) => {
    MotoristaService.atualizarStatus(req.motoristaId, 'offline');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'offline' });
    
    res.json({ sucesso: true, status: 'offline' });
});

// Pausar
router.post('/pausar', autenticarMotorista, (req, res) => {
    const { motivo } = req.body;
    
    MotoristaService.atualizarStatus(req.motoristaId, 'pausa');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'pausa' });
    
    res.json({ sucesso: true, status: 'pausa', motivo });
});

// ==================== CORRIDAS ====================

// Ver corridas disponíveis (pendentes)
router.get('/corridas-disponiveis', autenticarMotorista, (req, res) => {
    // Só mostra se motorista estiver disponível
    if (req.motorista.status !== 'disponivel') {
        return res.json([]);
    }
    
    const corridas = CorridaService.listarPendentes();
    
    // Remove dados sensíveis dos clientes
    const corridasLimpas = corridas.map(c => ({
        id: c.id,
        clienteNome: c.clienteNome?.split(' ')[0] || 'Cliente', // Só primeiro nome
        origem: c.origem,
        destino: c.destino,
        distanciaKm: c.distanciaKm,
        precoEstimado: c.precoEstimado,
        formaPagamento: c.formaPagamento,
        dataSolicitacao: c.dataSolicitacao
    }));
    
    res.json(corridasLimpas);
});

// Aceitar corrida
router.post('/aceitar-corrida', autenticarMotorista, (req, res) => {
    const { corridaId } = req.body;
    
    if (req.motorista.status !== 'disponivel') {
        return res.status(400).json({ error: 'Você precisa estar disponível para aceitar corridas' });
    }
    
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    if (corrida.status !== 'pendente') {
        return res.status(400).json({ error: 'Esta corrida já foi aceita por outro motorista' });
    }
    
    // Atribui corrida ao motorista
    const corridaAtualizada = CorridaService.atribuirMotorista(
        corridaId, 
        req.motoristaId, 
        req.motorista.nomeCompleto
    );
    
    MotoristaService.atualizarStatus(req.motoristaId, 'a_caminho');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'a_caminho' });
    
    res.json({
        sucesso: true,
        mensagem: 'Corrida aceita! Dirija-se ao local de embarque.',
        corrida: {
            id: corridaAtualizada.id,
            clienteNome: corridaAtualizada.clienteNome,
            clienteTelefone: corridaAtualizada.clienteTelefone,
            origem: corridaAtualizada.origem,
            destino: corridaAtualizada.destino,
            precoEstimado: corridaAtualizada.precoEstimado,
            formaPagamento: corridaAtualizada.formaPagamento
        }
    });
});

// Minha corrida atual
router.get('/minha-corrida-atual', autenticarMotorista, (req, res) => {
    const corridas = CorridaService.listarTodas({ motoristaId: req.motoristaId });
    const corridaAtual = corridas.find(c => 
        c.status === 'aceita' || c.status === 'em_andamento'
    );
    
    if (!corridaAtual) {
        return res.json({ temCorrida: false });
    }
    
    res.json({
        temCorrida: true,
        corrida: {
            id: corridaAtual.id,
            clienteNome: corridaAtual.clienteNome,
            clienteTelefone: corridaAtual.clienteTelefone,
            origem: corridaAtual.origem,
            destino: corridaAtual.destino,
            distanciaKm: corridaAtual.distanciaKm,
            precoEstimado: corridaAtual.precoEstimado,
            formaPagamento: corridaAtual.formaPagamento,
            status: corridaAtual.status
        }
    });
});

// Iniciar corrida (chegou no cliente)
router.post('/iniciar-corrida', autenticarMotorista, (req, res) => {
    const { corridaId } = req.body;
    
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida || corrida.motoristaId !== req.motoristaId) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    if (corrida.status !== 'aceita') {
        return res.status(400).json({ error: 'Corrida não pode ser iniciada' });
    }
    
    const corridaAtualizada = CorridaService.iniciar(corridaId);
    MotoristaService.atualizarStatus(req.motoristaId, 'em_corrida');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'em_corrida' });
    
    res.json({ sucesso: true, mensagem: 'Corrida iniciada!', corrida: corridaAtualizada });
});

// Finalizar corrida
router.post('/finalizar-corrida', autenticarMotorista, (req, res) => {
    const { corridaId, valorCobrado } = req.body;
    
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida || corrida.motoristaId !== req.motoristaId) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    if (corrida.status !== 'em_andamento') {
        return res.status(400).json({ error: 'Corrida não pode ser finalizada' });
    }
    
    const corridaFinalizada = CorridaService.finalizar(corridaId, valorCobrado || corrida.precoEstimado);
    MotoristaService.atualizarStatus(req.motoristaId, 'disponivel');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'disponivel' });
    
    // Incrementa contador de corridas do motorista
    const motorista = MotoristaService.buscarPorId(req.motoristaId);
    if (motorista) {
        motorista.corridasRealizadas++;
    }
    
    res.json({
        sucesso: true,
        mensagem: 'Corrida finalizada com sucesso!',
        corrida: corridaFinalizada
    });
});

// Cancelar corrida
router.post('/cancelar-corrida', autenticarMotorista, (req, res) => {
    const { corridaId, motivo } = req.body;
    
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida || corrida.motoristaId !== req.motoristaId) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    if (corrida.status !== 'aceita' && corrida.status !== 'em_andamento') {
        return res.status(400).json({ error: 'Corrida não pode ser cancelada' });
    }
    
    const corridaCancelada = CorridaService.cancelar(corridaId, motivo || 'Cancelado pelo motorista');
    MotoristaService.atualizarStatus(req.motoristaId, 'disponivel');
    GPSIntegradoService.atualizar(req.motoristaId, { status: 'disponivel' });
    
    res.json({ sucesso: true, mensagem: 'Corrida cancelada', corrida: corridaCancelada });
});

// ==================== HISTÓRICO E GANHOS ====================

// Minhas corridas (histórico)
router.get('/minhas-corridas', autenticarMotorista, (req, res) => {
    const { limite, status } = req.query;
    
    let corridas = CorridaService.listarTodas({ motoristaId: req.motoristaId });
    
    if (status) {
        corridas = corridas.filter(c => c.status === status);
    }
    
    // Limita quantidade
    if (limite) {
        corridas = corridas.slice(0, parseInt(limite));
    }
    
    res.json(corridas);
});

// Meus ganhos
router.get('/meus-ganhos', autenticarMotorista, (req, res) => {
    const corridas = CorridaService.listarTodas({ motoristaId: req.motoristaId });
    const finalizadas = corridas.filter(c => c.status === 'finalizada');
    
    const hoje = new Date().toISOString().split('T')[0];
    const corridasHoje = finalizadas.filter(c => c.dataFinalizacao?.startsWith(hoje));
    
    // Semana atual
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const corridasSemana = finalizadas.filter(c => new Date(c.dataFinalizacao) >= inicioSemana);
    
    // Mês atual
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const corridasMes = finalizadas.filter(c => new Date(c.dataFinalizacao) >= inicioMes);
    
    res.json({
        hoje: {
            corridas: corridasHoje.length,
            valor: corridasHoje.reduce((sum, c) => sum + (c.precoFinal || 0), 0)
        },
        semana: {
            corridas: corridasSemana.length,
            valor: corridasSemana.reduce((sum, c) => sum + (c.precoFinal || 0), 0)
        },
        mes: {
            corridas: corridasMes.length,
            valor: corridasMes.reduce((sum, c) => sum + (c.precoFinal || 0), 0)
        },
        total: {
            corridas: finalizadas.length,
            valor: finalizadas.reduce((sum, c) => sum + (c.precoFinal || 0), 0)
        }
    });
});

module.exports = router;
