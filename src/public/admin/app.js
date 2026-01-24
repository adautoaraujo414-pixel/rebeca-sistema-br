const token = localStorage.getItem('token');
if (!token && !window.location.pathname.includes('login')) window.location.href = '/admin/login';

const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (usuario.nome) {
    document.getElementById('userName').textContent = usuario.nome;
    document.getElementById('userRole').textContent = usuario.role;
}

function logout() { localStorage.clear(); window.location.href = '/admin/login'; }

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
    const loaders = {
        dashboard: carregarDashboard, mapa: carregarMapa, corridas: carregarCorridas,
        motoristas: carregarMotoristas, clientes: carregarClientes, faturamento: carregarFaturamento,
        ranking: carregarRanking, antifraude: carregarAntiFraude, blacklist: carregarBlacklist,
        reclamacoes: carregarReclamacoes, whatsapp: carregarWhatsApp, areas: carregarAreas,
        precos: carregarPrecos, config: carregarConfig, logs: carregarLogs
    };
    if (loaders[pagina]) loaders[pagina]();
}

async function api(url, method = 'GET', data = null) {
    const options = { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } };
    if (data) options.body = JSON.stringify(data);
    try { return await (await fetch(url, options)).json(); } catch (e) { return { error: 'Erro de conexão' }; }
}

// ==================== GRÁFICOS ====================
let chartCorridas = null, chartFaturamento = null;

function criarGraficoCorridas(dados) {
    const ctx = document.getElementById('chartCorridas');
    if (!ctx) return;
    if (chartCorridas) chartCorridas.destroy();
    chartCorridas = new Chart(ctx, {
        type: 'bar',
        data: { labels: dados.map(d => d.diaSemana), datasets: [
            { label: 'Finalizadas', data: dados.map(d => d.finalizadas), backgroundColor: '#27ae60', borderRadius: 5 },
            { label: 'Canceladas', data: dados.map(d => d.canceladas), backgroundColor: '#e74c3c', borderRadius: 5 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

function criarGraficoFaturamento(dados) {
    const ctx = document.getElementById('chartFaturamento');
    if (!ctx) return;
    if (chartFaturamento) chartFaturamento.destroy();
    chartFaturamento = new Chart(ctx, {
        type: 'line',
        data: { labels: dados.map(d => d.dataFormatada), datasets: [
            { label: 'Faturamento', data: dados.map(d => d.faturamentoBruto), borderColor: '#27ae60', backgroundColor: 'rgba(39,174,96,0.1)', fill: true, tension: 0.4 },
            { label: 'Comissão', data: dados.map(d => d.comissaoEmpresa), borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

// ==================== DASHBOARD ====================
async function carregarDashboard() {
    const dashboard = await api('/api/estatisticas/dashboard');
    const fraude = await api('/api/antifraude/estatisticas');
    
    document.getElementById('motoristasOnline').textContent = dashboard.motoristas?.online || 0;
    document.getElementById('corridasHoje').textContent = dashboard.corridas?.hoje || 0;
    document.getElementById('corridasPendentes').textContent = dashboard.corridas?.pendentes || 0;
    document.getElementById('faturamentoHoje').textContent = (dashboard.faturamento?.hoje?.bruto || 0).toFixed(2);
    document.getElementById('alertasFraude').textContent = fraude.alertas?.pendentes || 0;
    
    const corridasDia = await api('/api/estatisticas/corridas-por-dia?dias=7');
    criarGraficoCorridas(corridasDia);
    
    const horarios = await api('/api/estatisticas/horarios-pico');
    const picos = horarios.filter(h => h.corridas > 0).sort((a, b) => b.corridas - a.corridas).slice(0, 8);
    const max = Math.max(...picos.map(h => h.corridas), 1);
    document.getElementById('horariosPico').innerHTML = picos.map(h => `
        <div class="pico-container"><span class="hora-label">${h.horaFormatada}</span>
        <div class="pico-bar ${h.nivel}" style="width:${(h.corridas/max)*200}px;"></div>
        <span class="pico-value">${h.corridas}</span></div>`).join('') || '<p style="color:#999;">Sem dados</p>';
    
    const topMot = await api('/api/estatisticas/ranking-motoristas?limite=5&periodo=semana');
    document.getElementById('topMotoristas').innerHTML = topMot.length ? topMot.map((m,i) => `
        <div class="ranking-item"><div class="ranking-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':'normal'}">${m.posicao}</div>
        <div class="ranking-info"><h4>${m.nome}</h4><small>${m.corridasRealizadas} corridas</small></div>
        <div class="ranking-stats"><div class="valor">R$ ${m.faturamento.toFixed(2)}</div></div></div>`).join('') : '<p style="color:#999;">Sem dados</p>';
    
    const ativas = await api('/api/corridas/ativas');
    document.getElementById('corridasAtivasTable').innerHTML = ativas.length ? ativas.slice(0,5).map(c => `
        <tr><td>${c.clienteNome||'-'}</td><td>${c.motoristaNome||'<span class="badge yellow">Aguardando</span>'}</td>
        <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">✕</button></td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#999;">Nenhuma</td></tr>';
}

// ==================== MAPA ====================
let mapaLeaflet = null, marcadores = [];
async function carregarMapa() {
    const stats = await api('/api/motoristas/estatisticas');
    document.getElementById('mapaDisponiveis').textContent = stats.disponiveis || 0;
    document.getElementById('mapaEmCorrida').textContent = stats.emCorrida || 0;
    document.getElementById('mapaOffline').textContent = stats.offline || 0;
    if (!mapaLeaflet) {
        mapaLeaflet = L.map('mapaLeaflet').setView([-23.5327, -46.7917], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaLeaflet);
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
            const icon = L.divIcon({ html: `<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;">🚗</div>`, className: '', iconSize: [30, 30] });
            marcadores.push(L.marker([m.latitude, m.longitude], { icon }).addTo(mapaLeaflet).bindPopup(`<b>${m.nome}</b><br>${formatStatus(m.status)}`));
        }
    });
}

// ==================== CORRIDAS ====================
async function carregarCorridas() {
    const status = document.getElementById('filtroCorrida').value;
    const corridas = await api('/api/corridas' + (status ? '?status=' + status : ''));
    document.getElementById('corridasTable').innerHTML = corridas.length ? corridas.map(c => `
        <tr><td>${c.id.slice(-6)}</td><td>${c.clienteNome||'-'}</td><td>${(c.origem?.endereco||'-').slice(0,20)}...</td>
        <td>${(c.destino?.endereco||'-').slice(0,20)}...</td><td>R$ ${(c.precoFinal||c.precoEstimado||0).toFixed(2)}</td>
        <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
        <td>${c.status==='pendente'?`<button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">Cancelar</button>`:''}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhuma</td></tr>';
}

async function cancelarCorrida(id) { if (confirm('Cancelar?')) { await api('/api/corridas/'+id+'/cancelar','PUT',{motivo:'Admin'}); carregarCorridas(); carregarDashboard(); } }

// ==================== MOTORISTAS ====================
async function carregarMotoristas() {
    const busca = document.getElementById('buscaMotorista').value;
    const status = document.getElementById('filtroStatusMotorista').value;
    let url = '/api/motoristas?';
    if (busca) url += 'busca=' + busca + '&';
    if (status) url += 'status=' + status;
    const motoristas = await api(url);
    document.getElementById('motoristasTable').innerHTML = motoristas.length ? motoristas.map(m => `
        <tr><td><strong>${m.nomeCompleto||m.nome}</strong></td><td>📱 ${m.whatsapp}</td>
        <td>${m.veiculo?.modelo||''} ${m.veiculo?.cor||''}</td><td><strong>${m.veiculo?.placa||'-'}</strong></td>
        <td><span class="badge ${getStatusColor(m.status)}">${formatStatus(m.status)}</span></td>
        <td>⭐ ${(m.avaliacao||5).toFixed(1)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="desativarMotorista('${m.id}')">🗑️</button></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhum</td></tr>';
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
    const dados = {
        nomeCompleto: document.getElementById('motNome').value.trim(),
        whatsapp: document.getElementById('motWhatsApp').value.trim(),
        cpf: document.getElementById('motCPF').value.trim(),
        cnh: document.getElementById('motCNH').value.trim(),
        cnhValidade: document.getElementById('motCNHValidade').value,
        endereco: document.getElementById('motEndereco').value.trim(),
        veiculo: { modelo: document.getElementById('motVeiculoModelo').value.trim(), cor: document.getElementById('motVeiculoCor').value.trim(), placa: document.getElementById('motVeiculoPlaca').value.trim().toUpperCase(), ano: parseInt(document.getElementById('motVeiculoAno').value) || 2020 },
        senha: document.getElementById('motSenha').value.trim() || null
    };
    if (!dados.nomeCompleto || !dados.whatsapp || !dados.cnh || !dados.veiculo.modelo || !dados.veiculo.cor || !dados.veiculo.placa) {
        alertDiv.innerHTML = '<div class="alert alert-error">Preencha campos obrigatórios</div>'; return;
    }
    const result = await api('/api/motoristas', 'POST', dados);
    if (result.error) { alertDiv.innerHTML = `<div class="alert alert-error">${result.error}</div>`; return; }
    document.getElementById('formMotorista').style.display = 'none';
    document.getElementById('tokenGerado').textContent = result.motorista.token;
    document.getElementById('senhaGerada').textContent = result.motorista.senhaGerada;
    document.getElementById('tokenMotoristaBox').style.display = 'block';
    carregarMotoristas();
});

async function desativarMotorista(id) { if (confirm('Desativar?')) { await api('/api/motoristas/'+id,'DELETE'); carregarMotoristas(); } }

// ==================== CLIENTES ====================
async function carregarClientes() {
    const busca = document.getElementById('buscaCliente').value;
    const clientes = await api('/api/clientes' + (busca ? '?busca=' + busca : ''));
    document.getElementById('clientesTable').innerHTML = clientes.length ? clientes.map(c => `
        <tr><td>${c.nome}</td><td>📱 ${c.telefone}</td><td>${c.corridasRealizadas||0}</td>
        <td><span class="badge blue">${c.nivel?.nome||'Novo'}</span></td>
        <td><span class="badge ${c.bloqueado?'red':'green'}">${c.bloqueado?'Bloqueado':'Ativo'}</span></td>
        <td>${c.bloqueado?`<button class="btn btn-success btn-sm" onclick="desbloquearCliente('${c.id}')">Desbloquear</button>`:`<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${c.id}')">Bloquear</button>`}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhum</td></tr>';
}

function abrirModalCliente() { document.getElementById('formCliente').reset(); document.getElementById('modalCliente').classList.add('active'); }

document.getElementById('formCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/clientes', 'POST', { nome: document.getElementById('cliNome').value, telefone: document.getElementById('cliTelefone').value });
    fecharModal('modalCliente'); carregarClientes();
});

async function bloquearCliente(id) { if (confirm('Bloquear?')) { await api('/api/clientes/'+id+'/bloquear','PUT',{motivo:'Admin'}); carregarClientes(); } }
async function desbloquearCliente(id) { await api('/api/clientes/'+id+'/desbloquear','PUT'); carregarClientes(); }

// ==================== FATURAMENTO ====================
async function carregarFaturamento() {
    const resumo = await api('/api/estatisticas/faturamento-resumo');
    document.getElementById('fatHoje').textContent = (resumo.hoje?.bruto||0).toFixed(2);
    document.getElementById('fatSemana').textContent = (resumo.semana?.bruto||0).toFixed(2);
    document.getElementById('fatMes').textContent = (resumo.mes?.bruto||0).toFixed(2);
    document.getElementById('fatComissao').textContent = (resumo.mes?.comissao||0).toFixed(2);
    const dados = await api('/api/estatisticas/faturamento-por-dia?dias=30');
    criarGraficoFaturamento(dados);
}

// ==================== RANKING ====================
async function carregarRanking() {
    const periodo = document.getElementById('rankingPeriodo').value;
    const motoristas = await api('/api/estatisticas/ranking-motoristas?limite=10&periodo=' + periodo);
    document.getElementById('rankingLista').innerHTML = motoristas.length ? motoristas.map((m,i) => `
        <div class="ranking-item"><div class="ranking-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':'normal'}">${m.posicao}</div>
        <div class="ranking-info"><h4>${m.nome}</h4><small>${m.corridasRealizadas} corridas | ${m.kmRodados.toFixed(1)} km</small></div>
        <div class="ranking-stats"><div class="valor">R$ ${m.faturamento.toFixed(2)}</div></div></div>`).join('') : '<p style="color:#999;">Sem dados</p>';
}

// ==================== ANTI-FRAUDE ====================
async function carregarAntiFraude() {
    const stats = await api('/api/antifraude/estatisticas');
    document.getElementById('fraudeCriticos').textContent = stats.alertas?.porNivel?.critico || 0;
    document.getElementById('fraudeAltos').textContent = stats.alertas?.porNivel?.alto || 0;
    document.getElementById('fraudePendentes').textContent = stats.alertas?.pendentes || 0;
    document.getElementById('fraudeResolvidos').textContent = stats.alertas?.resolvidos || 0;
    
    const filtros = {
        status: document.getElementById('filtroFraudeStatus').value,
        nivel: document.getElementById('filtroFraudeNivel').value,
        tipo: document.getElementById('filtroFraudeTipo').value
    };
    let url = '/api/antifraude/alertas?';
    if (filtros.status) url += 'status=' + filtros.status + '&';
    if (filtros.nivel) url += 'nivel=' + filtros.nivel + '&';
    if (filtros.tipo) url += 'tipo=' + filtros.tipo;
    
    const alertas = await api(url);
    document.getElementById('alertasFraudeLista').innerHTML = alertas.length ? alertas.map(a => `
        <div class="alerta-fraude ${a.nivel}">
            <div class="alerta-header">
                <div><strong>${a.entidadeNome}</strong> <span class="badge ${a.nivel==='critico'||a.nivel==='alto'?'red':a.nivel==='medio'?'orange':'green'}">${a.nivel.toUpperCase()}</span> <span class="badge ${a.status==='pendente'?'yellow':a.status==='analisando'?'blue':'green'}">${a.status}</span></div>
                <small>${new Date(a.dataCriacao).toLocaleString('pt-BR')}</small>
            </div>
            <div class="alerta-motivos"><ul>${a.motivos.map(m => `<li>⚠️ ${m}</li>`).join('')}</ul></div>
            <div>
                ${a.status === 'pendente' ? `<button class="btn btn-primary btn-sm" onclick="analisarAlerta('${a.id}')">🔍 Analisar</button>` : ''}
                ${a.status === 'analisando' ? `<button class="btn btn-success btn-sm" onclick="resolverAlerta('${a.id}')">✅ Resolver</button> <button class="btn btn-danger btn-sm" onclick="bloquearPorAlerta('${a.id}')">🚫 Bloquear</button>` : ''}
                ${a.status === 'pendente' || a.status === 'analisando' ? `<button class="btn btn-warning btn-sm" onclick="ignorarAlerta('${a.id}')">❌ Ignorar</button>` : ''}
            </div>
        </div>
    `).join('') : '<p style="color:#999;padding:20px;">Nenhum alerta de fraude</p>';
    
    const regras = await api('/api/antifraude/regras');
    document.getElementById('regrasTable').innerHTML = regras.map(r => `
        <tr><td>${r.nome}</td><td><span class="badge blue">${r.tipo}</span></td>
        <td>${r.campo} ${r.operador} ${Array.isArray(r.valor)?r.valor.join('-'):r.valor}</td>
        <td><strong>${r.pontos}</strong></td>
        <td><span class="badge ${r.ativo?'green':'red'}">${r.ativo?'Ativo':'Inativo'}</span></td></tr>`).join('');
}

async function analisarAlerta(id) {
    await api('/api/antifraude/alertas/'+id+'/analisar', 'PUT', { analisadoPor: usuario.nome || 'Admin' });
    carregarAntiFraude();
}

async function resolverAlerta(id) {
    const resolucao = prompt('Descreva a resolução:');
    if (resolucao) { await api('/api/antifraude/alertas/'+id+'/resolver', 'PUT', { resolucao }); carregarAntiFraude(); }
}

async function bloquearPorAlerta(id) {
    const resolucao = prompt('Motivo do bloqueio:');
    if (resolucao) { await api('/api/antifraude/alertas/'+id+'/resolver', 'PUT', { resolucao, acao: 'bloquear' }); carregarAntiFraude(); carregarBlacklist(); }
}

async function ignorarAlerta(id) {
    const motivo = prompt('Motivo para ignorar:');
    if (motivo) { await api('/api/antifraude/alertas/'+id+'/ignorar', 'PUT', { motivo }); carregarAntiFraude(); }
}

// ==================== BLACKLIST ====================
async function carregarBlacklist() {
    const stats = await api('/api/antifraude/estatisticas');
    document.getElementById('blacklistTotal').textContent = stats.blacklist?.total || 0;
    document.getElementById('blacklistTelefones').textContent = stats.blacklist?.porTipo?.telefone || 0;
    document.getElementById('blacklistCPFs').textContent = stats.blacklist?.porTipo?.cpf || 0;
    
    const lista = await api('/api/antifraude/blacklist');
    document.getElementById('blacklistTable').innerHTML = lista.length ? lista.map(b => `
        <tr><td><span class="badge purple">${b.tipo}</span></td><td><strong>${b.valor}</strong></td>
        <td>${b.motivo}</td><td>${new Date(b.dataBloqueio).toLocaleDateString('pt-BR')}</td>
        <td><button class="btn btn-success btn-sm" onclick="removerBlacklist('${b.id}')">Remover</button></td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;">Nenhum</td></tr>';
}

function abrirModalBlacklist() { document.getElementById('formBlacklist').reset(); document.getElementById('modalBlacklist').classList.add('active'); }

document.getElementById('formBlacklist').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/antifraude/blacklist', 'POST', {
        tipo: document.getElementById('blTipo').value,
        valor: document.getElementById('blValor').value,
        motivo: document.getElementById('blMotivo').value
    });
    fecharModal('modalBlacklist'); carregarBlacklist();
});

async function removerBlacklist(id) { if (confirm('Remover da blacklist?')) { await api('/api/antifraude/blacklist/'+id,'DELETE'); carregarBlacklist(); } }

// ==================== RECLAMAÇÕES ====================
async function carregarReclamacoes() {
    const stats = await api('/api/reclamacoes/estatisticas');
    document.getElementById('recPendentes').textContent = stats.pendentes || 0;
    document.getElementById('recAndamento').textContent = stats.emAndamento || 0;
    document.getElementById('recResolvidas').textContent = stats.resolvidas || 0;
    
    const filtro = document.getElementById('filtroReclamacao').value;
    const reclamacoes = await api('/api/reclamacoes' + (filtro ? '?status=' + filtro : ''));
    document.getElementById('reclamacoesTable').innerHTML = reclamacoes.length ? reclamacoes.map(r => `
        <tr><td>${new Date(r.dataAbertura).toLocaleDateString('pt-BR')}</td><td>${r.clienteNome}</td><td>${r.assunto}</td>
        <td><span class="badge ${r.prioridade==='alta'?'red':r.prioridade==='media'?'yellow':'green'}">${r.prioridade}</span></td>
        <td><span class="badge ${r.status==='resolvida'?'green':r.status==='em_andamento'?'yellow':'red'}">${r.status}</span></td>
        <td>${r.status!=='resolvida'?`<button class="btn btn-success btn-sm" onclick="resolverReclamacao('${r.id}')">✓</button>`:''}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhuma</td></tr>';
}

function abrirModalReclamacao() { document.getElementById('formReclamacao').reset(); document.getElementById('modalReclamacao').classList.add('active'); }

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
    fecharModal('modalReclamacao'); carregarReclamacoes();
});

async function resolverReclamacao(id) { const r = prompt('Resolução:'); if (r) { await api('/api/reclamacoes/'+id+'/resolver','PUT',{resolucao:r}); carregarReclamacoes(); } }

// ==================== WHATSAPP ====================
async function carregarWhatsApp() {
    const config = await api('/api/config/whatsapp');
    document.getElementById('whatsappApiUrl').value = config.apiUrl || '';
    document.getElementById('whatsappApiKey').value = config.apiKey || '';
    document.getElementById('whatsappInstancia').value = config.instancia || 'rebeca-taxi';
    document.getElementById('whatsappStatus').innerHTML = config.conectado ? `<p><span class="status-indicator online"></span> <strong>Conectado</strong></p>` : `<p><span class="status-indicator offline"></span> <strong>Desconectado</strong></p>`;
}

async function salvarConfigWhatsApp() {
    await api('/api/config/whatsapp', 'PUT', { apiUrl: document.getElementById('whatsappApiUrl').value, apiKey: document.getElementById('whatsappApiKey').value, instancia: document.getElementById('whatsappInstancia').value });
    alert('Salvo!'); carregarWhatsApp();
}

async function testarWhatsApp() { const s = await api('/api/whatsapp/status'); alert(s.conectado ? 'Conectado!' : 'Não conectado'); }

// ==================== ÁREAS ====================
async function carregarAreas() {
    const areas = await api('/api/config/areas');
    document.getElementById('areasTable').innerHTML = areas.length ? areas.map(a => `
        <tr><td><strong>${a.nome}</strong></td><td>${a.cidade}</td><td>${a.bairros?.join(', ')||'-'}</td>
        <td>R$ ${(a.taxaExtra||0).toFixed(2)}</td><td><span class="badge ${a.ativo?'green':'red'}">${a.ativo?'Ativo':'Inativo'}</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="excluirArea('${a.id}')">🗑️</button></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhuma</td></tr>';
}

function abrirModalArea() { document.getElementById('formArea').reset(); document.getElementById('modalArea').classList.add('active'); }

document.getElementById('formArea').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/config/areas', 'POST', { nome: document.getElementById('areaNome').value, cidade: document.getElementById('areaCidade').value, bairros: document.getElementById('areaBairros').value.split(',').map(b=>b.trim()).filter(b=>b), taxaExtra: parseFloat(document.getElementById('areaTaxa').value)||0 });
    fecharModal('modalArea'); carregarAreas();
});

async function excluirArea(id) { if (confirm('Excluir?')) { await api('/api/config/areas/'+id,'DELETE'); carregarAreas(); } }

// ==================== PREÇOS ====================
async function carregarPrecos() {
    const config = await api('/api/preco-dinamico/config');
    document.getElementById('taxaBase').value = config.taxaBase || 5;
    document.getElementById('precoKm').value = config.precoKm || 2.5;
    document.getElementById('taxaMinima').value = config.taxaMinima || 15;
}

async function salvarConfigPreco() {
    await api('/api/preco-dinamico/config', 'PUT', { taxaBase: parseFloat(document.getElementById('taxaBase').value), precoKm: parseFloat(document.getElementById('precoKm').value), taxaMinima: parseFloat(document.getElementById('taxaMinima').value) });
    alert('Salvo!');
}

// ==================== CONFIG ====================
async function carregarConfig() {
    const config = await api('/api/config');
    document.getElementById('cfgTempoEspera').value = config.tempoMaximoEspera || 10;
    document.getElementById('cfgTempoAceite').value = config.tempoMaximoAceite || 5;
    document.getElementById('cfgRaioBusca').value = config.raioMaximoBusca || 15;
    document.getElementById('cfgComissao').value = config.comissaoEmpresa || 15;
    document.getElementById('cfgAvaliacaoMin').value = config.avaliacaoMinima || 3;
}

async function salvarConfiguracoes() {
    await api('/api/config', 'PUT', { tempoMaximoEspera: parseInt(document.getElementById('cfgTempoEspera').value), tempoMaximoAceite: parseInt(document.getElementById('cfgTempoAceite').value), raioMaximoBusca: parseInt(document.getElementById('cfgRaioBusca').value), comissaoEmpresa: parseInt(document.getElementById('cfgComissao').value), avaliacaoMinima: parseFloat(document.getElementById('cfgAvaliacaoMin').value) });
    alert('Salvo!');
}

// ==================== LOGS ====================
async function carregarLogs() {
    const stats = await api('/api/logs/estatisticas');
    document.getElementById('logTotal').textContent = stats.total || 0;
    document.getElementById('logHoje').textContent = stats.hoje || 0;
    document.getElementById('logErros').textContent = stats.porTipo?.erro || 0;
    
    const filtro = document.getElementById('filtroLogTipo').value;
    const logs = await api('/api/logs?limite=50' + (filtro ? '&tipo=' + filtro : ''));
    document.getElementById('logsLista').innerHTML = logs.length ? logs.map(l => `
        <div class="log-item ${l.tipo}"><span style="color:#999;font-size:0.85em;">${new Date(l.dataHora).toLocaleString('pt-BR')}</span> <strong>${l.acao}</strong> <span style="color:#3498db;">- ${l.usuarioNome}</span></div>`).join('') : '<p style="color:#999;">Nenhum log</p>';
}

// ==================== HELPERS ====================
function getStatusColor(s) { return { disponivel:'green',online:'green',finalizada:'green',resolvida:'green',em_corrida:'blue',em_andamento:'blue',aceita:'blue',pendente:'yellow',a_caminho:'yellow',media:'yellow',offline:'red',cancelada:'red',bloqueado:'red',alta:'red' }[s] || 'blue'; }
function formatStatus(s) { return { disponivel:'Disponível',em_corrida:'Em Corrida',offline:'Offline',pendente:'Pendente',aceita:'Aceita',em_andamento:'Em Andamento',finalizada:'Finalizada',cancelada:'Cancelada',resolvida:'Resolvida' }[s] || s; }

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'modalMotorista') { document.getElementById('formMotorista').style.display = 'block'; document.getElementById('tokenMotoristaBox').style.display = 'none'; }
}

document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) fecharModal(m.id); }));

carregarDashboard();
setInterval(carregarDashboard, 30000);
