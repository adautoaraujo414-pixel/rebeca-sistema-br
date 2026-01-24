const { v4: uuidv4 } = require('uuid');

const configuracoes = {
    tempoMaximoEspera: 10,
    tempoMaximoAceite: 5,
    raioMaximoBusca: 15,
    comissaoEmpresa: 15,
    avaliacaoMinima: 3.0,
    corridaMinimaKm: 1,
    whatsapp: {
        apiUrl: '',
        apiKey: '',
        instancia: 'rebeca-taxi',
        conectado: false
    }
};

const areasCobertura = new Map();
const reclamacoes = new Map();
const niveisAcesso = new Map();

// Áreas de cobertura exemplo
const areasExemplo = [
    { id: 'area_001', nome: 'Osasco - Centro', cidade: 'Osasco', bairros: ['Centro', 'Bela Vista', 'Pestana'], ativo: true, taxaExtra: 0 },
    { id: 'area_002', nome: 'Osasco - Zona Norte', cidade: 'Osasco', bairros: ['Presidente Altino', 'Jaguaribe', 'Remédios'], ativo: true, taxaExtra: 0 },
    { id: 'area_003', nome: 'Carapicuíba', cidade: 'Carapicuíba', bairros: ['Centro', 'Vila Dirce', 'Cohab'], ativo: true, taxaExtra: 3 },
    { id: 'area_004', nome: 'Barueri', cidade: 'Barueri', bairros: ['Centro', 'Alphaville', 'Tamboré'], ativo: true, taxaExtra: 5 },
    { id: 'area_005', nome: 'São Paulo - Zona Oeste', cidade: 'São Paulo', bairros: ['Pinheiros', 'Lapa', 'Perdizes'], ativo: true, taxaExtra: 8 }
];

areasExemplo.forEach(a => areasCobertura.set(a.id, a));

// Níveis de acesso
const niveisExemplo = [
    { id: 'nivel_admin', nome: 'Administrador', permissoes: ['tudo'], descricao: 'Acesso total ao sistema' },
    { id: 'nivel_operador', nome: 'Operador', permissoes: ['corridas', 'motoristas', 'clientes', 'mapa'], descricao: 'Gerencia operações diárias' },
    { id: 'nivel_financeiro', nome: 'Financeiro', permissoes: ['relatorios', 'financeiro', 'comissoes'], descricao: 'Acesso a relatórios e financeiro' },
    { id: 'nivel_atendimento', nome: 'Atendimento', permissoes: ['clientes', 'reclamacoes', 'corridas_visualizar'], descricao: 'Atendimento ao cliente' }
];

niveisExemplo.forEach(n => niveisAcesso.set(n.id, n));

// Reclamações exemplo
const reclamacoesExemplo = [
    { id: 'rec_001', tipo: 'motorista', clienteNome: 'Maria Silva', clienteTelefone: '11999887766', motoristaId: 'mot_001', motoristaNome: 'Carlos Silva', corridaId: 'cor_001', assunto: 'Atraso', descricao: 'Motorista demorou 20 minutos para chegar', status: 'pendente', prioridade: 'media', dataAbertura: '2026-01-22T10:30:00Z', dataResolucao: null, resolucao: null },
    { id: 'rec_002', tipo: 'cobranca', clienteNome: 'João Santos', clienteTelefone: '11988776655', motoristaId: null, motoristaNome: null, corridaId: 'cor_002', assunto: 'Valor incorreto', descricao: 'Foi cobrado valor maior que o combinado', status: 'resolvida', prioridade: 'alta', dataAbertura: '2026-01-21T14:00:00Z', dataResolucao: '2026-01-21T16:30:00Z', resolucao: 'Estorno realizado' }
];

reclamacoesExemplo.forEach(r => reclamacoes.set(r.id, r));

const ConfigService = {
    // ========== CONFIGURAÇÕES GERAIS ==========
    obterConfig: () => ({ ...configuracoes }),
    
    atualizarConfig: (novasConfig) => {
        Object.keys(novasConfig).forEach(key => {
            if (configuracoes.hasOwnProperty(key)) {
                configuracoes[key] = novasConfig[key];
            }
        });
        return { ...configuracoes };
    },

    // ========== WHATSAPP ==========
    obterConfigWhatsApp: () => ({ ...configuracoes.whatsapp }),
    
    atualizarConfigWhatsApp: (config) => {
        configuracoes.whatsapp = { ...configuracoes.whatsapp, ...config };
        return configuracoes.whatsapp;
    },

    // ========== ÁREAS DE COBERTURA ==========
    listarAreas: (apenasAtivas = false) => {
        let areas = Array.from(areasCobertura.values());
        if (apenasAtivas) areas = areas.filter(a => a.ativo);
        return areas.sort((a, b) => a.nome.localeCompare(b.nome));
    },

    obterArea: (id) => areasCobertura.get(id),

    criarArea: (dados) => {
        const id = 'area_' + uuidv4().slice(0, 8);
        const area = {
            id,
            nome: dados.nome,
            cidade: dados.cidade,
            bairros: dados.bairros || [],
            ativo: true,
            taxaExtra: dados.taxaExtra || 0
        };
        areasCobertura.set(id, area);
        return area;
    },

    atualizarArea: (id, dados) => {
        const area = areasCobertura.get(id);
        if (!area) return null;
        const atualizada = { ...area, ...dados, id };
        areasCobertura.set(id, atualizada);
        return atualizada;
    },

    excluirArea: (id) => areasCobertura.delete(id),

    verificarCobertura: (cidade, bairro) => {
        const areas = Array.from(areasCobertura.values()).filter(a => a.ativo);
        for (const area of areas) {
            if (area.cidade.toLowerCase() === cidade.toLowerCase()) {
                if (!bairro || area.bairros.some(b => b.toLowerCase() === bairro.toLowerCase())) {
                    return { coberto: true, area, taxaExtra: area.taxaExtra };
                }
            }
        }
        return { coberto: false, area: null, taxaExtra: 0 };
    },

    // ========== NÍVEIS DE ACESSO ==========
    listarNiveis: () => Array.from(niveisAcesso.values()),

    obterNivel: (id) => niveisAcesso.get(id),

    verificarPermissao: (nivelId, permissao) => {
        const nivel = niveisAcesso.get(nivelId);
        if (!nivel) return false;
        if (nivel.permissoes.includes('tudo')) return true;
        return nivel.permissoes.includes(permissao);
    },

    // ========== RECLAMAÇÕES ==========
    listarReclamacoes: (filtros = {}) => {
        let resultado = Array.from(reclamacoes.values());
        if (filtros.status) resultado = resultado.filter(r => r.status === filtros.status);
        if (filtros.tipo) resultado = resultado.filter(r => r.tipo === filtros.tipo);
        if (filtros.prioridade) resultado = resultado.filter(r => r.prioridade === filtros.prioridade);
        if (filtros.motoristaId) resultado = resultado.filter(r => r.motoristaId === filtros.motoristaId);
        resultado.sort((a, b) => new Date(b.dataAbertura) - new Date(a.dataAbertura));
        return resultado;
    },

    obterReclamacao: (id) => reclamacoes.get(id),

    criarReclamacao: (dados) => {
        const id = 'rec_' + uuidv4().slice(0, 8);
        const reclamacao = {
            id,
            tipo: dados.tipo || 'outro',
            clienteNome: dados.clienteNome,
            clienteTelefone: dados.clienteTelefone,
            motoristaId: dados.motoristaId || null,
            motoristaNome: dados.motoristaNome || null,
            corridaId: dados.corridaId || null,
            assunto: dados.assunto,
            descricao: dados.descricao,
            status: 'pendente',
            prioridade: dados.prioridade || 'media',
            dataAbertura: new Date().toISOString(),
            dataResolucao: null,
            resolucao: null
        };
        reclamacoes.set(id, reclamacao);
        return reclamacao;
    },

    atualizarReclamacao: (id, dados) => {
        const rec = reclamacoes.get(id);
        if (!rec) return null;
        const atualizada = { ...rec, ...dados, id };
        reclamacoes.set(id, atualizada);
        return atualizada;
    },

    resolverReclamacao: (id, resolucao) => {
        const rec = reclamacoes.get(id);
        if (!rec) return null;
        rec.status = 'resolvida';
        rec.resolucao = resolucao;
        rec.dataResolucao = new Date().toISOString();
        reclamacoes.set(id, rec);
        return rec;
    },

    obterEstatisticasReclamacoes: () => {
        const lista = Array.from(reclamacoes.values());
        return {
            total: lista.length,
            pendentes: lista.filter(r => r.status === 'pendente').length,
            emAndamento: lista.filter(r => r.status === 'em_andamento').length,
            resolvidas: lista.filter(r => r.status === 'resolvida').length,
            porTipo: {
                motorista: lista.filter(r => r.tipo === 'motorista').length,
                cobranca: lista.filter(r => r.tipo === 'cobranca').length,
                app: lista.filter(r => r.tipo === 'app').length,
                outro: lista.filter(r => r.tipo === 'outro').length
            }
        };
    }
};

module.exports = ConfigService;
