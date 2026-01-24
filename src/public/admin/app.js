// ==================== AUTENTICAÇÃO ====================
const token = localStorage.getItem('token');
if (!token && !window.location.pathname.includes('login')) {
    window.location.href = '/admin/login';
}

const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (usuario.nome) {
    document.getElementById('userName').textContent = usuario.nome;
    document.getElementById('userRole').textContent = usuario.role;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/admin/login';
}

// ==================== NAVEGAÇÃO ====================
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const pageId = item.getAttribute('data-page');
        document.getElementById(pageId).classList.add('active');
        carregarPagina(pageId);
    });
});

function carregarPagina(pagina) {
    switch(pagina) {
        case 'dashboard': carregarDashboard(); break;
        case 'mapa': carregarMapa(); break;
        case 'corridas': carregarCorridas(); break;
        case 'motoristas': carregarMotoristas(); break;
        case 'clientes': carregarClientes(); break;
        case 'faturamento': carregarFaturamento(); break;
        case 'ranking': carregarRanking(); break;
        case 'reclamacoes': carregarReclamacoes(); break;
        case 'whatsapp': carregarWhatsApp(); break;
        case 'areas': carregarAreas(); break;
        case 'precos': carregarPrecos(); break;
        case 'config': carregarConfig(); break;
        case 'logs': carregarLogs(); break;
    }
}

// ==================== API HELPER ====================
async function api(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    if (data) options.body = JSON.stringify(data);
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('Erro API:', error);
        return { error: 'Erro de conexão' };
    }
}

// ==================== GRÁFICOS ====================
let chartCorridas = null;
let chartFaturamento = null;

function criarGraficoCorridas(dados) {
    const ctx = document.getElementById('chartCorridas');
    if (!ctx) return;
    
    if (chartCorridas) chartCorridas.destroy();
    
    chartCorridas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.map(d => d.diaSemana),
            datasets: [{
                label: 'Finalizadas',
                data: dados.map(d => d.finalizadas),
                backgroundColor: '#27ae60',
                borderRadius: 5
            }, {
                label: 'Canceladas',
                data: dados.map(d => d.canceladas),
                backgroundColor: '#e74c3c',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function criarGraficoFaturamento(dados) {
    const ctx = document.getElementById('chartFaturamento');
    if (!ctx) return;
    
    if (chartFaturamento) chartFaturamento.destroy();
    
    chartFaturamento = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dados.map(d => d.dataFormatada),
            datasets: [{
                label: 'Faturamento (R$)',
                data: dados.map(d => d.faturamentoBruto),
                borderColor: '#27ae60',
                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                fill: true,
                tension: 0.4
            }, {
                label: 'Comissão (R$)',
                data: dados.map(d => d.comissaoEmpresa),
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ==================== DASHBOARD ====================
async function carregarDashboard() {
    // Dados básicos
    const dashboard = await api('/api/estatisticas/dashboard');
    
    document.getElementById('motoristasOnline').textContent = dashboard.motoristas?.online || 0;
    document.getElementById('corridasHoje').textContent = dashboard.corridas?.hoje || 0;
    document.getElementById('corridasPendentes').textContent = dashboard.corridas?.pendentes || 0;
    document.getElementById('faturamentoHoje').textContent = (dashboard.faturamento?.hoje?.bruto || 0).toFixed(2);
    document.getElementById('comissaoHoje').textContent = (dashboard.faturamento?.hoje?.comissao || 0).toFixed(2);
    
    // Gráfico de corridas
    const corridasDia = await api('/api/estatisticas/corridas-por-dia?dias=7');
    criarGraficoCorridas(corridasDia);
    
    // Horários de pico
    const horarios = await api('/api/estatisticas/horarios-pico');
    renderizarHorariosPico(horarios);
    
    // Top motoristas
    const topMotoristas = await api('/api/estatisticas/ranking-motoristas?limite=5&periodo=semana');
    renderizarTopMotoristas(topMotoristas);
    
    // Corridas ativas
    const ativas = await api('/api/corridas/ativas');
    renderizarCorridasAtivas(ativas);
}

function renderizarHorariosPico(horarios) {
    const container = document.getElementById('horariosPico');
    if (!container) return;
    
    const picos = horarios.filter(h => h.corridas > 0).sort((a, b) => b.corridas - a.corridas).slice(0, 8);
    const max = Math.max(...picos.map(h => h.corridas), 1);
    
    container.innerHTML = picos.map(h => `
        <div class="pico-container">
            <span class="hora-label">${h.horaFormatada}</span>
            <div class="pico-bar ${h.nivel}" style="width: ${(h.corridas / max) * 200}px;"></div>
            <span class="pico-value">${h.corridas} corridas</span>
        </div>
    `).join('') || '<p style="color:#999;">Sem dados de horários</p>';
}

function renderizarTopMotoristas(motoristas) {
    const container = document.getElementById('topMotoristas');
    if (!container) return;
    
    container.innerHTML = motoristas.length ? motoristas.map((m, i) => `
        <div class="ranking-item">
            <div class="ranking-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${m.posicao}</div>
            <div class="ranking-info">
                <h4>${m.nome}</h4>
                <small>${m.corridasRealizadas} corridas | ⭐ ${(m.avaliacao || 5).toFixed(1)}</small>
            </div>
            <div class="ranking-stats">
                <div class="valor">R$ ${m.faturamento.toFixed(2)}</div>
            </div>
        </div>
    `).join('') : '<p style="color:#999;padding:20px;">Sem dados de ranking</p>';
}

function renderizarCorridasAtivas(corridas) {
    const tbody = document.getElementById('corridasAtivasTable');
    if (!tbody) return;
    
    tbody.innerHTML = corridas.length ? corridas.slice(0, 5).map(c => `
        <tr>
            <td>${c.clienteNome || '-'}</td>
            <td>${c.motoristaNome || '<span class="badge yellow">Aguardando</span>'}</td>
            <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
            <td><button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">✕</button></td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;color:#999;">Nenhuma corrida ativa</td></tr>';
}

// ==================== MAPA ====================
let mapaLeaflet = null;
let marcadores = [];

async function carregarMapa() {
    const stats = await api('/api/motoristas/estatisticas');
    document.getElementById('mapaDisponiveis').textContent = stats.disponiveis || 0;
    document.getElementById('mapaEmCorrida').textContent = stats.emCorrida || 0;
    document.getElementById('mapaOffline').textContent = stats.offline || 0;
    
    if (!mapaLeaflet) {
        mapaLeaflet = L.map('mapaLeaflet').setView([-23.5327, -46.7917], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaLeaflet);
    }
    atualizarMapa();
}

async function atualizarMapa() {
    if (!mapaLeaflet) return;
    marcadores.forEach(m => mapaLeaflet.removeLayer(m));
    marcadores = [];
    
    const motoristas = await api('/api/gps-integrado');
    motoristas.forEach(m => {
        if (m.latitude && m.longitude) {
            const cor = m.status === 'disponivel' ? '#27ae60' : m.status === 'em_corrida' ? '#3498db' : '#999';
            const icon = L.divIcon({
                html: `<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🚗</div>`,
                className: '',
                iconSize: [30, 30]
            });
            const marker = L.marker([m.latitude, m.longitude], { icon })
                .addTo(mapaLeaflet)
                .bindPopup(`<b>${m.nome}</b><br>Status: ${formatStatus(m.status)}`);
            marcadores.push(marker);
        }
    });
}

// ==================== CORRIDAS ====================
async function carregarCorridas() {
    const status = document.getElementById('filtroCorrida').value;
    const corridas = await api('/api/corridas' + (status ? '?status=' + status : ''));
    const tbody = document.getElementById('corridasTable');
    
    tbody.innerHTML = corridas.length ? corridas.map(c => `
        <tr>
            <td>${c.id.slice(-6)}</td>
            <td>${c.clienteNome || '-'}</td>
            <td>${(c.origem?.endereco || '-').slice(0, 20)}...</td>
            <td>${(c.destino?.endereco || '-').slice(0, 20)}...</td>
            <td>R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}</td>
            <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
            <td>${c.status === 'pendente' || c.status === 'aceita' ? `<button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">Cancelar</button>` : ''}</td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhuma corrida</td></tr>';
}

async function cancelarCorrida(id) {
    if (confirm('Cancelar corrida?')) {
        await api('/api/corridas/' + id + '/cancelar', 'PUT', { motivo: 'Cancelado pelo admin' });
        carregarCorridas();
        carregarDashboard();
    }
}

// ==================== MOTORISTAS ====================
async function carregarMotoristas() {
    const busca = document.getElementById('buscaMotorista').value;
    const status = document.getElementById('filtroStatusMotorista').value;
    let url = '/api/motoristas?';
    if (busca) url += 'busca=' + busca + '&';
    if (status) url += 'status=' + status;
    
    const motoristas = await api(url);
    const tbody = document.getElementById('motoristasTable');
    
    tbody.innerHTML = motoristas.length ? motoristas.map(m => `
        <tr>
            <td><strong>${m.nomeCompleto || m.nome}</strong></td>
            <td>📱 ${m.whatsapp}</td>
            <td>${m.veiculo?.modelo || ''} ${m.veiculo?.cor || ''}</td>
            <td><strong>${m.veiculo?.placa || '-'}</strong></td>
            <td><span class="badge ${getStatusColor(m.status)}">${formatStatus(m.status)}</span></td>
            <td>⭐ ${(m.avaliacao || 5).toFixed(1)}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="editarMotorista('${m.id}')">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="desativarMotorista('${m.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhum motorista</td></tr>';
}

function abrirModalMotorista() {
    document.getElementById('formMotorista').reset();
    document.getElementById('formMotorista').style.display = 'block';
    document.getElementById('tokenMotoristaBox').style.display = 'none';
    document.getElementById('formMotoristaAlert').innerHTML = '';
    document.getElementById('modalMotorista').classList.add('active');
}

document.getElementById('formMotorista').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertDiv = document.getElementById('formMotoristaAlert');
    alertDiv.innerHTML = '';
    
    const dados = {
        nomeCompleto: document.getElementById('motNome').value.trim(),
        whatsapp: document.getElementById('motWhatsApp').value.trim(),
        cpf: document.getElementById('motCPF').value.trim(),
        cnh: document.getElementById('motCNH').value.trim(),
        cnhValidade: document.getElementById('motCNHValidade').value,
        endereco: document.getElementById('motEndereco').value.trim(),
        veiculo: {
            modelo: document.getElementById('motVeiculoModelo').value.trim(),
            cor: document.getElementById('motVeiculoCor').value.trim(),
            placa: document.getElementById('motVeiculoPlaca').value.trim().toUpperCase(),
            ano: parseInt(document.getElementById('motVeiculoAno').value) || 2020
        },
        senha: document.getElementById('motSenha').value.trim() || null
    };
    
    if (!dados.nomeCompleto || !dados.whatsapp || !dados.cnh || !dados.veiculo.modelo || !dados.veiculo.cor || !dados.veiculo.placa) {
        alertDiv.innerHTML = '<div class="alert alert-error">Preencha todos os campos obrigatórios (*)</div>';
        return;
    }
    
    const result = await api('/api/motoristas', 'POST', dados);
    
    if (result.error) {
        alertDiv.innerHTML = `<div class="alert alert-error">${result.error}</div>`;
        return;
    }
    
    document.getElementById('formMotorista').style.display = 'none';
    document.getElementById('tokenGerado').textContent = result.motorista.token;
    document.getElementById('senhaGerada').textContent = result.motorista.senhaGerada;
    document.getElementById('tokenMotoristaBox').style.display = 'block';
    carregarMotoristas();
});

async function desativarMotorista(id) {
    if (confirm('Desativar motorista?')) {
        await api('/api/motoristas/' + id, 'DELETE');
        carregarMotoristas();
    }
}

// ==================== CLIENTES ====================
async function carregarClientes() {
    const busca = document.getElementById('buscaCliente').value;
    const clientes = await api('/api/clientes' + (busca ? '?busca=' + busca : ''));
    const tbody = document.getElementById('clientesTable');
    
    tbody.innerHTML = clientes.length ? clientes.map(c => `
        <tr>
            <td>${c.nome}</td>
            <td>📱 ${c.telefone}</td>
            <td>${c.corridasRealizadas || 0}</td>
            <td><span class="badge blue">${c.nivel?.nome || 'Novo'}</span></td>
            <td><span class="badge ${c.bloqueado ? 'red' : 'green'}">${c.bloqueado ? 'Bloqueado' : 'Ativo'}</span></td>
            <td>
                ${c.bloqueado 
                    ? `<button class="btn btn-success btn-sm" onclick="desbloquearCliente('${c.id}')">Desbloquear</button>`
                    : `<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${c.id}')">Bloquear</button>`}
            </td>
        </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhum cliente</td></tr>';
}

function abrirModalCliente() {
    document.getElementById('formCliente').reset();
    document.getElementById('modalCliente').classList.add('active');
}

document.getElementById('formCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/clientes', 'POST', {
        nome: document.getElementById('cliNome').value,
        telefone: document.getElementById('cliTelefone').value
    });
    fecharModal('modalCliente');
    carregarClientes();
});

async function bloquearCliente(id) {
    if (confirm('Bloquear cliente?')) {
        await api('/api/clientes/' + id + '/bloquear', 'PUT', { motivo: 'Bloqueado pelo admin' });
        carregarClientes();
    }
}

async function desbloquearCliente(id) {
    await api('/api/clientes/' + id + '/desbloquear', 'PUT');
    carregarClientes();
}

// ==================== FATURAMENTO ====================
async function carregarFaturamento() {
    const resumo = await api('/api/estatisticas/faturamento-resumo');
    document.getElementById('fatHoje').textContent = (resumo.hoje?.bruto || 0).toFixed(2);
    document.getElementById('fatSemana').textContent = (resumo.semana?.bruto || 0).toFixed(2);
    document.getElementById('fatMes').textContent = (resumo.mes?.bruto || 0).toFixed(2);
    document.getElementById('fatComissao').textContent = (resumo.mes?.comissao || 0).toFixed(2);
    
    const dados = await api('/api/estatisticas/faturamento-por-dia?dias=30');
    criarGraficoFaturamento(dados);
}

// ==================== RANKING ====================
async function carregarRanking() {
    const periodo = document.getElementById('rankingPeriodo').value;
    const motoristas = await api('/api/estatisticas/ranking-motoristas?limite=10&periodo=' + periodo);
    
    const container = document.getElementById('rankingLista');
    container.innerHTML = motoristas.length ? motoristas.map((m, i) => `
        <div class="ranking-item">
            <div class="ranking-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${m.posicao}</div>
            <div class="ranking-info">
                <h4>${m.nome}</h4>
                <small>${m.corridasRealizadas} corridas | ${m.kmRodados.toFixed(1)} km | ⭐ ${(m.avaliacao || 5).toFixed(1)}</small>
            </div>
            <div class="ranking-stats">
                <div class="valor">R$ ${m.faturamento.toFixed(2)}</div>
            </div>
        </div>
    `).join('') : '<p style="color:#999;padding:20px;">Sem dados de ranking</p>';
}

// ==================== RECLAMAÇÕES ====================
async function carregarReclamacoes() {
    const stats = await api('/api/reclamacoes/estatisticas');
    document.getElementById('recPendentes').textContent = stats.pendentes || 0;
    document.getElementById('recAndamento').textContent = stats.emAndamento || 0;
    document.getElementById('recResolvidas').textContent = stats.resolvidas || 0;
    
    const filtro = document.getElementById('filtroReclamacao').value;
    const reclamacoes = await api('/api/reclamacoes' + (filtro ? '?status=' + filtro : ''));
    const tbody = document.getElementById('reclamacoesTable');
    
    tbody.innerHTML = reclamacoes.length ? reclamacoes.map(r => `
        <tr>
            <td>${new Date(r.dataAbertura).toLocaleDateString('pt-BR')}</td>
            <td>${r.clienteNome}<br><small>${r.clienteTelefone}</small></td>
            <td>${r.assunto}</td>
            <td><span class="badge ${r.prioridade === 'alta' ? 'red' : r.prioridade === 'media' ? 'yellow' : 'green'}">${r.prioridade}</span></td>
            <td><span class="badge ${r.status === 'resolvida' ? 'green' : r.status === 'em_andamento' ? 'yellow' : 'red'}">${formatStatus(r.status)}</span></td>
            <td>
                ${r.status !== 'resolvida' ? `<button class="btn btn-success btn-sm" onclick="resolverReclamacao('${r.id}')">✓ Resolver</button>` : ''}
            </td>
        </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhuma reclamação</td></tr>';
}

function abrirModalReclamacao() {
    document.getElementById('formReclamacao').reset();
    document.getElementById('modalReclamacao').classList.add('active');
}

document.getElementById('formReclamacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/reclamacoes', 'POST', {
        clienteNome: document.getElementById('recClienteNome').value,
        clienteTelefone: document.getElementById('recClienteTel').value,
        tipo: document.getElementById('recTipo').value,
        prioridade: document.getElementById('recPrioridade').value,
        assunto: document.getElementById('recAssunto').value,
        descricao: document.getElementById('recDescricao').value
    });
    fecharModal('modalReclamacao');
    carregarReclamacoes();
});

async function resolverReclamacao(id) {
    const resolucao = prompt('Descreva a resolução:');
    if (resolucao) {
        await api('/api/reclamacoes/' + id + '/resolver', 'PUT', { resolucao });
        carregarReclamacoes();
    }
}

// ==================== WHATSAPP ====================
async function carregarWhatsApp() {
    const config = await api('/api/config/whatsapp');
    document.getElementById('whatsappApiUrl').value = config.apiUrl || '';
    document.getElementById('whatsappApiKey').value = config.apiKey || '';
    document.getElementById('whatsappInstancia').value = config.instancia || 'rebeca-taxi';
    
    const statusDiv = document.getElementById('whatsappStatus');
    if (config.conectado) {
        statusDiv.innerHTML = `<p><span class="status-indicator online"></span> <strong>Conectado</strong></p><p style="color:#27ae60;">Rebeca está online!</p>`;
    } else {
        statusDiv.innerHTML = `<p><span class="status-indicator offline"></span> <strong>Desconectado</strong></p><p style="color:#666;">Configure a API para conectar</p>`;
    }
}

async function salvarConfigWhatsApp() {
    await api('/api/config/whatsapp', 'PUT', {
        apiUrl: document.getElementById('whatsappApiUrl').value,
        apiKey: document.getElementById('whatsappApiKey').value,
        instancia: document.getElementById('whatsappInstancia').value
    });
    alert('Configuração salva!');
    carregarWhatsApp();
}

async function testarWhatsApp() {
    const status = await api('/api/whatsapp/status');
    alert(status.conectado ? 'WhatsApp conectado!' : 'WhatsApp não conectado: ' + (status.erro || 'Verifique as configurações'));
}

// ==================== ÁREAS DE COBERTURA ====================
async function carregarAreas() {
    const areas = await api('/api/config/areas');
    const tbody = document.getElementById('areasTable');
    
    tbody.innerHTML = areas.length ? areas.map(a => `
        <tr>
            <td><strong>${a.nome}</strong></td>
            <td>${a.cidade}</td>
            <td>${a.bairros?.join(', ') || '-'}</td>
            <td>R$ ${(a.taxaExtra || 0).toFixed(2)}</td>
            <td><span class="badge ${a.ativo ? 'green' : 'red'}">${a.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td><button class="btn btn-danger btn-sm" onclick="excluirArea('${a.id}')">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhuma área</td></tr>';
}

function abrirModalArea() {
    document.getElementById('formArea').reset();
    document.getElementById('modalArea').classList.add('active');
}

document.getElementById('formArea').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/config/areas', 'POST', {
        nome: document.getElementById('areaNome').value,
        cidade: document.getElementById('areaCidade').value,
        bairros: document.getElementById('areaBairros').value.split(',').map(b => b.trim()).filter(b => b),
        taxaExtra: parseFloat(document.getElementById('areaTaxa').value) || 0
    });
    fecharModal('modalArea');
    carregarAreas();
});

async function excluirArea(id) {
    if (confirm('Excluir área?')) {
        await api('/api/config/areas/' + id, 'DELETE');
        carregarAreas();
    }
}

// ==================== PREÇOS ====================
async function carregarPrecos() {
    const config = await api('/api/preco-dinamico/config');
    document.getElementById('taxaBase').value = config.taxaBase || 5;
    document.getElementById('precoKm').value = config.precoKm || 2.5;
    document.getElementById('taxaMinima').value = config.taxaMinima || 15;
    
    const regras = await api('/api/preco-dinamico/regras');
    const tbody = document.getElementById('regrasTable');
    tbody.innerHTML = regras.length ? regras.map(r => `
        <tr>
            <td>${r.nome}</td>
            <td>${r.horaInicio} - ${r.horaFim}</td>
            <td><strong>${r.multiplicador}x</strong></td>
            <td><button class="btn btn-danger btn-sm" onclick="excluirRegra('${r.id}')">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;color:#999;">Nenhuma regra</td></tr>';
}

async function salvarConfigPreco() {
    await api('/api/preco-dinamico/config', 'PUT', {
        taxaBase: parseFloat(document.getElementById('taxaBase').value),
        precoKm: parseFloat(document.getElementById('precoKm').value),
        taxaMinima: parseFloat(document.getElementById('taxaMinima').value)
    });
    alert('Preços salvos!');
}

async function excluirRegra(id) {
    if (confirm('Excluir regra?')) {
        await api('/api/preco-dinamico/regras/' + id, 'DELETE');
        carregarPrecos();
    }
}

// ==================== CONFIGURAÇÕES ====================
async function carregarConfig() {
    const config = await api('/api/config');
    document.getElementById('cfgTempoEspera').value = config.tempoMaximoEspera || 10;
    document.getElementById('cfgTempoAceite').value = config.tempoMaximoAceite || 5;
    document.getElementById('cfgRaioBusca').value = config.raioMaximoBusca || 15;
    document.getElementById('cfgComissao').value = config.comissaoEmpresa || 15;
    document.getElementById('cfgAvaliacaoMin').value = config.avaliacaoMinima || 3;
    document.getElementById('cfgCorridaMin').value = config.corridaMinimaKm || 1;
    
    const niveis = await api('/api/config/niveis-acesso');
    const tbody = document.getElementById('niveisTable');
    tbody.innerHTML = niveis.map(n => `
        <tr>
            <td><strong>${n.nome}</strong></td>
            <td>${n.descricao}</td>
            <td>${n.permissoes.join(', ')}</td>
        </tr>
    `).join('');
}

async function salvarConfiguracoes() {
    await api('/api/config', 'PUT', {
        tempoMaximoEspera: parseInt(document.getElementById('cfgTempoEspera').value),
        tempoMaximoAceite: parseInt(document.getElementById('cfgTempoAceite').value),
        raioMaximoBusca: parseInt(document.getElementById('cfgRaioBusca').value),
        comissaoEmpresa: parseInt(document.getElementById('cfgComissao').value),
        avaliacaoMinima: parseFloat(document.getElementById('cfgAvaliacaoMin').value),
        corridaMinimaKm: parseFloat(document.getElementById('cfgCorridaMin').value)
    });
    alert('Configurações salvas!');
}

// ==================== LOGS ====================
async function carregarLogs() {
    const stats = await api('/api/logs/estatisticas');
    document.getElementById('logTotal').textContent = stats.total || 0;
    document.getElementById('logHoje').textContent = stats.hoje || 0;
    document.getElementById('logErros').textContent = stats.porTipo?.erro || 0;
    
    const filtro = document.getElementById('filtroLogTipo').value;
    const logs = await api('/api/logs?limite=50' + (filtro ? '&tipo=' + filtro : ''));
    
    const container = document.getElementById('logsLista');
    container.innerHTML = logs.length ? logs.map(l => `
        <div class="log-item ${l.tipo}">
            <span class="log-time">${new Date(l.dataHora).toLocaleString('pt-BR')}</span>
            <span class="log-acao">${l.acao}</span>
            <span class="log-usuario">- ${l.usuarioNome}</span>
        </div>
    `).join('') : '<p style="color:#999;padding:20px;">Nenhum log encontrado</p>';
}

// ==================== HELPERS ====================
function getStatusColor(status) {
    const colors = {
        'disponivel': 'green', 'online': 'green', 'finalizada': 'green', 'resolvida': 'green',
        'em_corrida': 'blue', 'em_andamento': 'blue', 'aceita': 'blue',
        'pendente': 'yellow', 'a_caminho': 'yellow', 'media': 'yellow',
        'offline': 'red', 'cancelada': 'red', 'bloqueado': 'red', 'alta': 'red'
    };
    return colors[status] || 'blue';
}

function formatStatus(status) {
    const nomes = {
        'disponivel': 'Disponível', 'em_corrida': 'Em Corrida', 'offline': 'Offline',
        'pendente': 'Pendente', 'aceita': 'Aceita', 'em_andamento': 'Em Andamento',
        'finalizada': 'Finalizada', 'cancelada': 'Cancelada', 'resolvida': 'Resolvida'
    };
    return nomes[status] || status;
}

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'modalMotorista') {
        document.getElementById('formMotorista').style.display = 'block';
        document.getElementById('tokenMotoristaBox').style.display = 'none';
    }
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal(modal.id);
    });
});

// ==================== INICIALIZAÇÃO ====================
carregarDashboard();
setInterval(carregarDashboard, 30000);
