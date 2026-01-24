const express = require('express');
const router = express.Router();
const PrecoDinamicoService = require('../services/preco-dinamico.service');
const LogsService = require('../services/logs.service');

// ==================== CONFIG BASE ====================
router.get('/config', (req, res) => {
    res.json(PrecoDinamicoService.getConfig());
});

router.put('/config', (req, res) => {
    const config = PrecoDinamicoService.setConfig(req.body);
    LogsService.registrar({ tipo: 'config', acao: 'Preços base atualizados', detalhes: config });
    res.json({ sucesso: true, config });
});

// ==================== ESTATÍSTICAS ====================
router.get('/estatisticas', (req, res) => {
    res.json(PrecoDinamicoService.getEstatisticas());
});

// ==================== FAIXAS DE HORÁRIO ====================
router.get('/faixas', (req, res) => {
    const diaSemana = req.query.dia;
    res.json(PrecoDinamicoService.listarFaixas(diaSemana));
});

router.get('/faixas/:id', (req, res) => {
    const faixa = PrecoDinamicoService.buscarFaixa(req.params.id);
    if (!faixa) return res.status(404).json({ error: 'Faixa não encontrada' });
    res.json(faixa);
});

router.post('/faixas', (req, res) => {
    const { diaSemana, horaInicio, horaFim, nome, multiplicador, taxaAdicional } = req.body;
    
    if (!diaSemana || !horaInicio || !horaFim) {
        return res.status(400).json({ error: 'diaSemana, horaInicio e horaFim são obrigatórios' });
    }
    
    const faixa = PrecoDinamicoService.criarFaixa(req.body);
    LogsService.registrar({ tipo: 'config', acao: 'Faixa de preço criada', detalhes: { faixa: faixa.nome, dia: diaSemana } });
    res.status(201).json(faixa);
});

router.put('/faixas/:id', (req, res) => {
    const faixa = PrecoDinamicoService.atualizarFaixa(req.params.id, req.body);
    if (!faixa) return res.status(404).json({ error: 'Faixa não encontrada' });
    
    LogsService.registrar({ tipo: 'config', acao: 'Faixa de preço atualizada', detalhes: { id: req.params.id } });
    res.json({ sucesso: true, faixa });
});

router.delete('/faixas/:id', (req, res) => {
    const sucesso = PrecoDinamicoService.excluirFaixa(req.params.id);
    if (!sucesso) return res.status(404).json({ error: 'Faixa não encontrada' });
    
    LogsService.registrar({ tipo: 'config', acao: 'Faixa de preço excluída', detalhes: { id: req.params.id } });
    res.json({ sucesso: true });
});

// Copiar faixas de um dia para outro
router.post('/faixas/copiar', (req, res) => {
    const { diaOrigem, diaDestino } = req.body;
    
    if (!diaOrigem || !diaDestino) {
        return res.status(400).json({ error: 'diaOrigem e diaDestino são obrigatórios' });
    }
    
    const faixas = PrecoDinamicoService.copiarFaixas(diaOrigem, diaDestino);
    LogsService.registrar({ tipo: 'config', acao: 'Faixas copiadas', detalhes: { de: diaOrigem, para: diaDestino } });
    res.json({ sucesso: true, faixas });
});

// ==================== CÁLCULO DE PREÇO (USADO PELA REBECA) ====================

// Obter faixa atual
router.get('/faixa-atual', (req, res) => {
    const faixa = PrecoDinamicoService.obterFaixaAtual();
    res.json(faixa);
});

// Calcular preço (endpoint principal para Rebeca)
router.post('/calcular', (req, res) => {
    const { distanciaKm, tempoMinutos, dataHora } = req.body;
    
    if (distanciaKm === undefined) {
        return res.status(400).json({ error: 'distanciaKm é obrigatório' });
    }
    
    const data = dataHora ? new Date(dataHora) : new Date();
    const resultado = PrecoDinamicoService.calcularPreco(
        parseFloat(distanciaKm),
        parseInt(tempoMinutos) || 0,
        data
    );
    
    res.json(resultado);
});

// Calcular preço rápido (GET para facilitar integração)
router.get('/calcular/:distanciaKm', (req, res) => {
    const distanciaKm = parseFloat(req.params.distanciaKm);
    const tempoMinutos = parseInt(req.query.tempo) || 0;
    
    const resultado = PrecoDinamicoService.calcularPreco(distanciaKm, tempoMinutos);
    res.json(resultado);
});

// Simular preços do dia (para mostrar ao cliente)
router.get('/simular/:distanciaKm/:diaSemana', (req, res) => {
    const distanciaKm = parseFloat(req.params.distanciaKm);
    const diaSemana = req.params.diaSemana;
    
    const simulacao = PrecoDinamicoService.simularPrecos(distanciaKm, diaSemana);
    res.json(simulacao);
});

// ==================== ENDPOINT ESPECIAL PARA REBECA ====================
// Retorna texto formatado para enviar ao cliente
router.post('/rebeca/cotacao', (req, res) => {
    const { origem, destino, distanciaKm } = req.body;
    
    if (!distanciaKm) {
        return res.status(400).json({ error: 'distanciaKm é obrigatório' });
    }
    
    const resultado = PrecoDinamicoService.calcularPreco(parseFloat(distanciaKm));
    const config = PrecoDinamicoService.getConfig();
    const faixa = PrecoDinamicoService.obterFaixaAtual();
    
    // Formatar mensagem para WhatsApp
    const mensagem = `🚗 *COTAÇÃO DE CORRIDA*

📍 *Origem:* ${origem || 'Não informada'}
🏁 *Destino:* ${destino || 'Não informado'}
📏 *Distância:* ${distanciaKm.toFixed(1)} km

💰 *VALOR: R$ ${resultado.precoFinal.toFixed(2)}*

📊 *Detalhes:*
- Taxa base: R$ ${config.taxaBase.toFixed(2)}
- Preço/km: R$ ${config.precoKm.toFixed(2)}
- Faixa atual: ${faixa.nome} (${faixa.multiplicador}x)
${faixa.taxaAdicional > 0 ? `• Taxa adicional: R$ ${faixa.taxaAdicional.toFixed(2)}` : ''}

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
router.get('/rebeca/tabela', (req, res) => {
    const config = PrecoDinamicoService.getConfig();
    const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
    const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaHoje = diasSemana[new Date().getDay()];
    
    const faixasHoje = PrecoDinamicoService.listarFaixas(diaHoje).filter(f => f.ativo);
    
    let tabela = `📋 *TABELA DE PREÇOS*

💵 *Valores Base:*
- Taxa inicial: R$ ${config.taxaBase.toFixed(2)}
- Por km: R$ ${config.precoKm.toFixed(2)}
- Mínimo: R$ ${config.taxaMinima.toFixed(2)}

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
router.get('/rebeca/exemplos', (req, res) => {
    const exemplos = [3, 5, 10, 15, 20]; // km
    const config = PrecoDinamicoService.getConfig();
    
    let mensagem = `📊 *EXEMPLOS DE PREÇO*\n\n`;
    
    exemplos.forEach(km => {
        const calc = PrecoDinamicoService.calcularPreco(km);
        mensagem += `📍 ${km} km → *R$ ${calc.precoFinal.toFixed(2)}*\n`;
    });
    
    mensagem += `\n_Valores para o horário atual._
_Sujeito a variação por demanda._`;

    res.json({
        sucesso: true,
        mensagem,
        exemplos: exemplos.map(km => ({
            distanciaKm: km,
            preco: PrecoDinamicoService.calcularPreco(km).precoFinal
        }))
    });
});

module.exports = router;
