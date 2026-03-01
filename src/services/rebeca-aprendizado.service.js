const mongoose = require('mongoose');

// Schema de interações (log de tudo que acontece)
const InteracaoSchema = mongoose.models.InteracaoRebeca || mongoose.model('InteracaoRebeca', new mongoose.Schema({
    telefone: String,
    adminId: mongoose.Schema.Types.ObjectId,
    mensagemCliente: String,
    intencaoDetectada: String,
    respostaRebeca: String,
    etapaAntes: String,
    etapaDepois: String,
    resultado: { type: String, enum: ['sucesso', 'falha', 'cancelado', 'nao_entendeu', 'conflito', 'escalado'], default: 'sucesso' },
    tempoResposta: Number,
    sentimentoCliente: { type: String, enum: ['positivo', 'neutro', 'negativo', 'nervoso'], default: 'neutro' },
    acertou: { type: Boolean, default: true },
    correcao: String, // Se admin corrigiu, qual era a resposta certa
    tags: [String]
}, { timestamps: true }));

// Schema de padrões aprendidos
const PadraoSchema = mongoose.models.PadraoRebeca || mongoose.model('PadraoRebeca', new mongoose.Schema({
    adminId: mongoose.Schema.Types.ObjectId,
    tipo: { type: String, enum: ['expressao_local', 'endereco_comum', 'reclamacao_frequente', 'conflito_resolvido', 'resposta_melhor'] },
    gatilho: String, // Ex: "manda um carro pro mercadão"
    resolucao: String, // Ex: intenção correta = SOLICITAR_CORRIDA
    confianca: { type: Number, default: 0.5 },
    usos: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }
}, { timestamps: true }));

// Schema de métricas diárias
const MetricaSchema = mongoose.models.MetricaRebeca || mongoose.model('MetricaRebeca', new mongoose.Schema({
    adminId: mongoose.Schema.Types.ObjectId,
    data: String, // '2026-03-01'
    totalInteracoes: { type: Number, default: 0 },
    naoEntendeu: { type: Number, default: 0 },
    conflitos: { type: Number, default: 0 },
    conflitosResolvidos: { type: Number, default: 0 },
    cancelamentos: { type: Number, default: 0 },
    clientesNervosos: { type: Number, default: 0 },
    corridasCriadas: { type: Number, default: 0 },
    avaliacaoMedia: { type: Number, default: 0 },
    topProblemas: [{ problema: String, contagem: Number }]
}, { timestamps: true }));

const AprendizadoService = {
    
    // ========== REGISTRAR INTERAÇÃO ==========
    async registrar(dados) {
        try {
            await InteracaoSchema.create(dados);
            
            // Atualizar métricas diárias
            const hoje = new Date().toISOString().slice(0, 10);
            const update = { $inc: { totalInteracoes: 1 } };
            
            if (dados.resultado === 'nao_entendeu') update.$inc.naoEntendeu = 1;
            if (dados.resultado === 'conflito') update.$inc.conflitos = 1;
            if (dados.resultado === 'cancelado') update.$inc.cancelamentos = 1;
            if (dados.sentimentoCliente === 'nervoso') update.$inc.clientesNervosos = 1;
            if (dados.etapaDepois === 'aguardando_motorista') update.$inc.corridasCriadas = 1;
            
            await MetricaSchema.findOneAndUpdate(
                { adminId: dados.adminId, data: hoje },
                update,
                { upsert: true }
            );
        } catch(e) { console.log('[APREND] Erro registrar:', e.message); }
    },

    // ========== DETECTAR SENTIMENTO ==========
    detectarSentimento(mensagem) {
        const msg = mensagem.toLowerCase();
        const nervoso = ['absurdo', 'ridículo', 'ridiculo', 'porra', 'merda', 'lixo', 'péssimo', 'pessimo', 'nunca mais', 'vou processar', 'procon', 'vergonha', 'roubo', 'ladrão', 'ladrao', 'palhaçada', 'palhacada', 'demora demais', 'cadê', 'cade meu'];
        const negativo = ['ruim', 'demorou', 'caro', 'reclamar', 'problema', 'errado', 'não gostei', 'insatisfeito', 'chateado', 'bravo'];
        const positivo = ['obrigado', 'obrigada', 'valeu', 'top', 'ótimo', 'otimo', 'excelente', 'parabéns', 'maravilha', 'perfeito', 'amei', 'muito bom', 'adorei'];
        
        if (nervoso.some(p => msg.includes(p))) return 'nervoso';
        if (negativo.some(p => msg.includes(p))) return 'negativo';
        if (positivo.some(p => msg.includes(p))) return 'positivo';
        return 'neutro';
    },

    // ========== BUSCAR PADRÕES APRENDIDOS ==========
    async buscarPadrao(mensagem, adminId) {
        try {
            const msg = mensagem.toLowerCase().trim();
            const padroes = await PadraoSchema.find({ adminId, ativo: true, confianca: { $gte: 0.6 } });
            
            for (const p of padroes) {
                if (msg.includes(p.gatilho.toLowerCase())) {
                    // Incrementar uso
                    await PadraoSchema.findByIdAndUpdate(p._id, { $inc: { usos: 1 } });
                    return p;
                }
            }
        } catch(e) {}
        return null;
    },

    // ========== AUTO-APRENDER DE ERROS ==========
    async autoAprender(adminId) {
        try {
            // Buscar interações recentes que não entendeu
            const naoEntendeu = await InteracaoSchema.find({
                adminId,
                resultado: 'nao_entendeu',
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600000) }
            }).sort({ createdAt: -1 }).limit(50);
            
            // Agrupar por mensagem similar
            const grupos = {};
            for (const inter of naoEntendeu) {
                const chave = inter.mensagemCliente.toLowerCase().trim().substring(0, 50);
                if (!grupos[chave]) grupos[chave] = { msg: inter.mensagemCliente, count: 0 };
                grupos[chave].count++;
            }
            
            // Se mesma msg apareceu 3+ vezes, criar padrão
            const novos = [];
            for (const [chave, grupo] of Object.entries(grupos)) {
                if (grupo.count >= 3) {
                    const existe = await PadraoSchema.findOne({ adminId, gatilho: grupo.msg.toLowerCase().substring(0, 50) });
                    if (!existe) {
                        novos.push(grupo.msg);
                    }
                }
            }
            
            return novos;
        } catch(e) { return []; }
    },

    // ========== RESOLVER CONFLITO COM IA ==========
    async resolverConflito(telefone, mensagem, contexto) {
        try {
            const axios = require('axios');
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) return null;
            
            // Buscar histórico recente do cliente
            const historico = await InteracaoSchema.find({ telefone })
                .sort({ createdAt: -1 }).limit(5).lean();
            
            const historicoTexto = historico.reverse().map(h => 
                `Cliente: ${h.mensagemCliente}\nRebeca: ${h.respostaRebeca}`
            ).join('\n\n');
            
            const prompt = `Você é Rebeca, secretária virtual de transporte. Um cliente está com problema e você precisa resolver sozinha, com empatia e eficiência.

HISTÓRICO:
${historicoTexto}

MENSAGEM ATUAL DO CLIENTE: "${mensagem}"

CONTEXTO:
- Cliente parece: ${contexto.sentimento}
- Etapa atual: ${contexto.etapa}
- Corrida ativa: ${contexto.temCorrida ? 'sim' : 'não'}

REGRAS:
- Seja empática, nunca defensiva
- Se o problema é demora: reconheça e dê estimativa real
- Se é preço: explique com carinho mas não dê desconto sem autorização
- Se é motorista grosso: peça desculpas e registre
- Se não consegue resolver: escale pro admin com contexto completo
- Resposta máxima 3 linhas
- Se resolver, diga o que vai fazer
- Se precisar escalar: retorne escalado: true

RETORNE APENAS JSON:
{
    "resposta": "texto da resposta",
    "acao": "resolver" ou "escalar" ou "oferecer_desconto" ou "remarcar",
    "escalado": false,
    "motivo_escalar": "",
    "aprendizado": "o que aprendeu com essa situação"
}`;

            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 300
            }, { headers: { 'Authorization': `Bearer ${apiKey}` } });

            const texto = res.data.choices[0].message.content.replace(/```json|```/g, '').trim();
            const resultado = JSON.parse(texto);
            
            // Salvar aprendizado
            if (resultado.aprendizado) {
                await PadraoSchema.create({
                    adminId: contexto.adminId,
                    tipo: 'conflito_resolvido',
                    gatilho: mensagem.toLowerCase().substring(0, 100),
                    resolucao: resultado.aprendizado,
                    confianca: 0.6
                });
            }
            
            return resultado;
        } catch(e) {
            console.log('[CONFLITO] Erro IA:', e.message);
            return null;
        }
    },

    // ========== GERAR CONTEXTO ENRIQUECIDO PRO GPT ==========
    async gerarContextoEnriquecido(telefone, adminId) {
        try {
            const historico = await InteracaoSchema.find({ telefone, adminId })
                .sort({ createdAt: -1 }).limit(10).lean();
            
            const padroes = await PadraoSchema.find({ adminId, ativo: true, confianca: { $gte: 0.7 } })
                .sort({ usos: -1 }).limit(10).lean();
            
            // Métricas recentes
            const hoje = new Date().toISOString().slice(0, 10);
            const metrica = await MetricaSchema.findOne({ adminId, data: hoje }).lean();
            
            let contexto = '';
            
            // Adicionar padrões aprendidos
            if (padroes.length > 0) {
                contexto += '\nPADRÕES APRENDIDOS (use como referência):\n';
                for (const p of padroes.slice(0, 5)) {
                    contexto += `- "${p.gatilho}" → ${p.resolucao} (${p.usos} usos, confiança ${(p.confianca*100).toFixed(0)}%)\n`;
                }
            }
            
            // Adicionar perfil do cliente
            if (historico.length > 0) {
                const cancelamentos = historico.filter(h => h.resultado === 'cancelado').length;
                const sentimentos = historico.map(h => h.sentimentoCliente);
                const predominante = sentimentos.sort((a,b) => sentimentos.filter(v => v===b).length - sentimentos.filter(v => v===a).length)[0];
                
                contexto += `\nPERFIL DO CLIENTE: ${historico.length} interações, sentimento predominante: ${predominante}`;
                if (cancelamentos > 2) contexto += ` ⚠️ ATENÇÃO: ${cancelamentos} cancelamentos recentes`;
                contexto += '\n';
            }
            
            return contexto;
        } catch(e) { return ''; }
    },

    // ========== MÉTRICAS DO DIA ==========
    async metricasHoje(adminId) {
        try {
            const hoje = new Date().toISOString().slice(0, 10);
            return await MetricaSchema.findOne({ adminId, data: hoje }).lean() || {
                totalInteracoes: 0, naoEntendeu: 0, conflitos: 0, corridasCriadas: 0
            };
        } catch(e) { return { totalInteracoes: 0 }; }
    }
};

module.exports = AprendizadoService;
