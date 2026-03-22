const express = require('express');
const router = express.Router();
const PrecoDinamicoService = require('../services/preco-dinamico.service');
const LogsService = require('../services/logs.service');
const PrecoAdminService = require('../services/preco-admin.service');

// Helper para pegar adminId de qualquer lugar da request
function getAdminId(req) {
    return req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId || null;
}

// ==================== CONFIG BASE ====================
router.get('/config', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const cfg = await PrecoAdminService.getConfig(adminId);
            return res.json(cfg);
        }
        res.json(PrecoDinamicoService.getConfig());
    } catch(e) { res.json(PrecoDinamicoService.getConfig()); }
});

router.post('/config', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ erro: 'AdminId obrigatório' });
        const resultado = await PrecoAdminService.salvarConfig(adminId, req.body);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/config', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const resultado = await PrecoAdminService.salvarConfig(adminId, req.body);
            return res.json(resultado);
        }
        const config = PrecoDinamicoService.setConfig(req.body);
        LogsService.registrar({ tipo: 'config', acao: 'Preços base atualizados', detalhes: config });
        res.json({ sucesso: true, config });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ==================== ESTATÍSTICAS ====================
router.get('/estatisticas', (req, res) => {
    res.json(PrecoDinamicoService.getEstatisticas());
});

// ==================== FAIXAS DE HORÁRIO ====================
const { Admin } = require('../models');
const mongoose = require('mongoose');

// ---- helpers de faixa no banco ----
async function getFaixasBanco(adminId, dia) {
    const admin = await Admin.findById(adminId).lean();
    let faixas = (admin?.faixasPreco || []).filter(f => f.ativo !== false);
    if (dia) faixas = faixas.filter(f => !f.diaSemana || f.diaSemana === dia || f.diaSemana === 'todos');
    return faixas.map(f => ({
        id: f._id?.toString() || f.id,
        nome: f.nome || 'Faixa',
        diaSemana: f.diaSemana || 'todos',
        horaInicio: f.horaInicio || '00:00',
        horaFim: f.horaFim || '23:59',
        multiplicador: f.multiplicador || 1,
        taxaAdicional: f.taxaAdicional || 0,
        tipo: f.tipo || 'multiplicador',
        valorFixo: f.valorFixo || 0,
        ativo: f.ativo !== false
    }));
}

router.get('/faixas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        const dia = req.query.dia;
        if (adminId) {
            const faixas = await getFaixasBanco(adminId, dia);
            return res.json(faixas);
        }
        res.json(PrecoDinamicoService.listarFaixas(dia));
    } catch(e) { res.json(PrecoDinamicoService.listarFaixas(req.query.dia)); }
});

router.get('/faixas/:id', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const admin = await Admin.findById(adminId).lean();
            const f = (admin?.faixasPreco || []).find(f => f._id?.toString() === req.params.id);
            if (!f) return res.status(404).json({ error: 'Faixa não encontrada' });
            return res.json({
                id: f._id?.toString(),
                nome: f.nome, diaSemana: f.diaSemana || 'todos',
                horaInicio: f.horaInicio || '00:00', horaFim: f.horaFim || '23:59',
                multiplicador: f.multiplicador || 1, taxaAdicional: f.taxaAdicional || 0,
                tipo: f.tipo || 'multiplicador', valorFixo: f.valorFixo || 0
            });
        }
        const faixa = PrecoDinamicoService.buscarFaixa(req.params.id);
        if (!faixa) return res.status(404).json({ error: 'Faixa não encontrada' });
        res.json(faixa);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/faixas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        const { diaSemana, horaInicio, horaFim, nome, multiplicador, taxaAdicional, tipo, valorFixo } = req.body;
        if (adminId) {
            if (!horaInicio || !horaFim) return res.status(400).json({ error: 'horaInicio e horaFim obrigatórios' });
            const novaFaixa = {
                _id: new mongoose.Types.ObjectId(),
                nome: nome || 'Nova Faixa',
                diaSemana: diaSemana || 'todos',
                horaInicio, horaFim,
                multiplicador: parseFloat(multiplicador) || 1,
                taxaAdicional: parseFloat(taxaAdicional) || 0,
                tipo: tipo || 'multiplicador',
                valorFixo: parseFloat(valorFixo) || 0,
                ativo: true
            };
            await Admin.findByIdAndUpdate(adminId, { $push: { faixasPreco: novaFaixa } });
            LogsService.registrar({ tipo: 'config', acao: 'Faixa criada no banco', detalhes: { nome: novaFaixa.nome } });
            return res.status(201).json({ ...novaFaixa, id: novaFaixa._id.toString() });
        }
        if (!diaSemana || !horaInicio || !horaFim) return res.status(400).json({ error: 'diaSemana, horaInicio e horaFim são obrigatórios' });
        const faixa = PrecoDinamicoService.criarFaixa(req.body);
        res.status(201).json(faixa);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/faixas/:id', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const { nome, horaInicio, horaFim, multiplicador, taxaAdicional, tipo, valorFixo, diaSemana } = req.body;
            const update = {};
            if (nome !== undefined) update['faixasPreco.$[el].nome'] = nome;
            if (horaInicio !== undefined) update['faixasPreco.$[el].horaInicio'] = horaInicio;
            if (horaFim !== undefined) update['faixasPreco.$[el].horaFim'] = horaFim;
            if (multiplicador !== undefined) update['faixasPreco.$[el].multiplicador'] = parseFloat(multiplicador);
            if (taxaAdicional !== undefined) update['faixasPreco.$[el].taxaAdicional'] = parseFloat(taxaAdicional);
            if (tipo !== undefined) update['faixasPreco.$[el].tipo'] = tipo;
            if (valorFixo !== undefined) update['faixasPreco.$[el].valorFixo'] = parseFloat(valorFixo);
            if (diaSemana !== undefined) update['faixasPreco.$[el].diaSemana'] = diaSemana;
            await Admin.findByIdAndUpdate(
                adminId,
                { $set: update },
                { arrayFilters: [{ 'el._id': new mongoose.Types.ObjectId(req.params.id) }] }
            );
            LogsService.registrar({ tipo: 'config', acao: 'Faixa atualizada no banco', detalhes: { id: req.params.id } });
            return res.json({ sucesso: true });
        }
        const faixa = PrecoDinamicoService.atualizarFaixa(req.params.id, req.body);
        if (!faixa) return res.status(404).json({ error: 'Faixa não encontrada' });
        res.json({ sucesso: true, faixa });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/faixas/:id', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            await Admin.findByIdAndUpdate(adminId, {
                $pull: { faixasPreco: { _id: new mongoose.Types.ObjectId(req.params.id) } }
            });
            LogsService.registrar({ tipo: 'config', acao: 'Faixa excluída do banco', detalhes: { id: req.params.id } });
            return res.json({ sucesso: true });
        }
        const sucesso = PrecoDinamicoService.excluirFaixa(req.params.id);
        if (!sucesso) return res.status(404).json({ error: 'Faixa não encontrada' });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Copiar faixas de um dia para outro
router.post('/faixas/copiar', async (req, res) => {
    const { diaOrigem, diaDestino } = req.body;
    if (!diaOrigem || !diaDestino) return res.status(400).json({ error: 'diaOrigem e diaDestino são obrigatórios' });
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const admin = await Admin.findById(adminId).lean();
            const faixasOrigem = (admin?.faixasPreco || []).filter(f => f.ativo !== false && (f.diaSemana === diaOrigem || f.diaSemana === 'todos'));
            const novasFaixas = faixasOrigem.map(f => ({
                ...f,
                _id: new mongoose.Types.ObjectId(),
                diaSemana: diaDestino
            }));
            if (novasFaixas.length > 0) {
                await Admin.findByIdAndUpdate(adminId, { $push: { faixasPreco: { $each: novasFaixas } } });
            }
            LogsService.registrar({ tipo: 'config', acao: 'Faixas copiadas no banco', detalhes: { de: diaOrigem, para: diaDestino, qtd: novasFaixas.length } });
            return res.json({ sucesso: true, copiadas: novasFaixas.length });
        }
        const faixas = PrecoDinamicoService.copiarFaixas(diaOrigem, diaDestino);
        LogsService.registrar({ tipo: 'config', acao: 'Faixas copiadas', detalhes: { de: diaOrigem, para: diaDestino } });
        res.json({ sucesso: true, faixas });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== CÁLCULO DE PREÇO (USADO PELA REBECA) ====================

// Obter faixa atual
router.get('/faixa-atual', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const faixa = await PrecoAdminService.getFaixaAtual(adminId);
            return res.json(faixa);
        }
    } catch(e) {}
    res.json(PrecoDinamicoService.obterFaixaAtual());
});

// Calcular preço (endpoint principal para Rebeca)
router.post('/calcular', async (req, res) => {
    const { distanciaKm, tempoMinutos, dataHora } = req.body;
    if (distanciaKm === undefined) return res.status(400).json({ error: 'distanciaKm é obrigatório' });
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const resultado = await PrecoAdminService.calcularPreco(adminId, parseFloat(distanciaKm), parseInt(tempoMinutos) || 0);
            return res.json(resultado);
        }
    } catch(e) {}
    const data = dataHora ? new Date(dataHora) : new Date();
    res.json(PrecoDinamicoService.calcularPreco(parseFloat(distanciaKm), parseInt(tempoMinutos) || 0, data));
});

// Calcular preço rápido (GET para facilitar integração)
router.get('/calcular/:distanciaKm', async (req, res) => {
    const distanciaKm = parseFloat(req.params.distanciaKm);
    const tempoMinutos = parseInt(req.query.tempo) || 0;
    try {
        const adminId = getAdminId(req);
        if (adminId) {
            const resultado = await PrecoAdminService.calcularPreco(adminId, distanciaKm, tempoMinutos);
            return res.json(resultado);
        }
    } catch(e) {}
    res.json(PrecoDinamicoService.calcularPreco(distanciaKm, tempoMinutos));
});

// Simular preços do dia (para mostrar ao cliente)
router.get('/simular/:distanciaKm/:diaSemana', (req, res) => {
    const distanciaKm = parseFloat(req.params.distanciaKm);
    const diaSemana = req.params.diaSemana;
    const simulacao = PrecoDinamicoService.simularPrecos(distanciaKm, diaSemana);
    res.json(simulacao);
});

// POST /simular — aceita { km, dia } do painel admin
router.post('/simular', (req, res) => {
    try {
        const km = parseFloat(req.body.km || req.body.distanciaKm || 5);
        const dia = req.body.dia || req.body.diaSemana || 'semana';
        const simulacao = PrecoDinamicoService.simularPrecos(km, dia);
        // Normalizar resposta para o frontend
        // simularPrecos retorna array de faixas [{nome, horaInicio, horaFim, precoFinal, tipoCalculo}]
        if (Array.isArray(simulacao) && simulacao.length > 0) {
            // Pegar a faixa atual (hora atual dentro do intervalo) ou a primeira
            const agora = new Date();
            const horaAtual = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
            const faixaAtual = simulacao.find(f => horaAtual >= f.horaInicio && horaAtual <= f.horaFim) || simulacao[0];
            const precoTotal = faixaAtual.precoFinal ?? faixaAtual.total ?? 0;
            const detalhes = 'Faixa: ' + (faixaAtual.nome || '') + 
                             (faixaAtual.tipoCalculo === 'fixo' ? ' (preço fixo)' : ' (' + faixaAtual.multiplicador + 'x)') +
                             ' · ' + faixaAtual.horaInicio + '–' + faixaAtual.horaFim;
            return res.json({ sucesso: true, precoTotal, detalhes, todasFaixas: simulacao });
        }
        const precoTotal = simulacao?.precoTotal ?? simulacao?.total ?? simulacao?.preco ?? '—';
        res.json({ sucesso: true, precoTotal, detalhes: '', raw: simulacao });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ==================== ENDPOINT ESPECIAL PARA REBECA ====================
// Retorna texto formatado para enviar ao cliente
router.post('/rebeca/cotacao', async (req, res) => {
    const { origem, destino, distanciaKm } = req.body;
    
    if (!distanciaKm) {
        return res.status(400).json({ error: 'distanciaKm é obrigatório' });
    }
    
    const adminId = getAdminId(req);
    let resultado, config, faixa;
    try {
        if (adminId) {
            resultado = await PrecoAdminService.calcularPreco(adminId, parseFloat(distanciaKm), 0);
            config = await PrecoAdminService.getConfig(adminId);
            faixa = await PrecoAdminService.getFaixaAtual(adminId);
            resultado.precoFinal = resultado.precoFinal ?? resultado.preco ?? resultado.total ?? 15;
        } else {
            throw new Error('sem adminId');
        }
    } catch(e) {
        resultado = PrecoDinamicoService.calcularPreco(parseFloat(distanciaKm));
        config = PrecoDinamicoService.getConfig();
        faixa = PrecoDinamicoService.obterFaixaAtual();
    }
    
    // Formatar mensagem para WhatsApp
    const mensagem = `🚗 *COTAÇÃO DE CORRIDA*

📍 *Origem:* ${origem || 'Não informada'}
🏁 *Destino:* ${destino || 'Não informado'}
📏 *Distância:* ${parseFloat(distanciaKm).toFixed(1)} km

💰 *VALOR: R$ ${(resultado.precoFinal || 15).toFixed(2)}*

📊 *Detalhes:*
- Taxa base: R$ ${(config.taxaBase || 5).toFixed(2)}
- Preço/km: R$ ${(config.precoKm || 2.5).toFixed(2)}
- Faixa atual: ${faixa.nome || 'Padrão'} (${(faixa.multiplicador || 1)}x)
${faixa.taxaAdicional > 0 ? `• Taxa adicional: R$ ${(faixa.taxaAdicional || 0).toFixed(2)}` : ''}

⏰ Preço válido para o horário atual.
_Valores podem variar conforme horário e demanda._

Deseja confirmar a corrida? 🚕`;

    res.json({
        sucesso: true,
        preco: resultado.precoFinal,
        mensagem,
        detalhes: resultado.detalhes
    });
});

// Tabela de preços formatada para WhatsApp
router.get('/rebeca/tabela', async (req, res) => {
    const adminId = getAdminId(req);
    const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaHoje = diasSemana[new Date().getDay()];
    let config, faixaAtual, faixasHoje;
    try {
        if (adminId) {
            config = await PrecoAdminService.getConfig(adminId);
            faixaAtual = await PrecoAdminService.getFaixaAtual(adminId);
            const { Admin } = require('../models');
            const admin = await Admin.findById(adminId).lean();
            faixasHoje = ((admin?.faixasPreco || []).filter(f => f.ativo !== false && (!f.diaSemana || f.diaSemana === diaHoje || f.diaSemana === 'todos')));
        } else {
            throw new Error('sem adminId');
        }
    } catch(e) {
        config = PrecoDinamicoService.getConfig();
        faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        faixasHoje = PrecoDinamicoService.listarFaixas(diaHoje).filter(f => f.ativo);
    }
    
    let tabela = `📋 *TABELA DE PREÇOS*

💵 *Valores Base:*
- Taxa inicial: R$ ${(config.taxaBase || 5).toFixed(2)}
- Por km: R$ ${(config.precoKm || 2.5).toFixed(2)}
- Mínimo: R$ ${(config.taxaMinima || 15).toFixed(2)}

⏰ *Faixas de hoje (${diaHoje}):*
`;

    faixasHoje.forEach(f => {
        const emoji = f.multiplicador > 1.3 ? '🔴' : f.multiplicador > 1.1 ? '🟡' : '🟢';
        tabela += `${emoji} ${f.horaInicio}-${f.horaFim}: ${f.nome} (${f.multiplicador}x)`;
        if (f.taxaAdicional > 0) tabela += ` +R$${f.taxaAdicional.toFixed(2)}`;
        tabela += '\n';
    });

    tabela += `
📍 *Faixa atual:* ${faixaAtual.nome}
${faixaAtual.multiplicador > 1 ? `⚡ Multiplicador: ${faixaAtual.multiplicador}x` : '✅ Preço normal'}

_Para cotação, envie origem e destino!_`;

    res.json({
        sucesso: true,
        mensagem: tabela,
        config,
        faixaAtual
    });
});

// Exemplos de preço para WhatsApp
router.get('/rebeca/exemplos', async (req, res) => {
    const adminId = getAdminId(req);
    const kms = [3, 5, 10, 15, 20];
    let mensagem = '📊 *EXEMPLOS DE PREÇO*\n\n';
    const calculos = [];
    for (const km of kms) {
        let preco;
        try {
            if (adminId) {
                const r = await PrecoAdminService.calcularPreco(adminId, km, 0);
                preco = r.precoFinal ?? r.preco ?? r.total ?? 15;
            } else {
                throw new Error('sem adminId');
            }
        } catch(e) {
            preco = PrecoDinamicoService.calcularPreco(km).precoFinal;
        }
        mensagem += `📍 ${km} km → *R$ ${preco.toFixed(2)}*\n`;
        calculos.push({ distanciaKm: km, preco });
    }
    mensagem += '\n_Valores para o horário atual._\n_Sujeito a variação por demanda._';
    res.json({ sucesso: true, mensagem, exemplos: calculos });
});

module.exports = router;
