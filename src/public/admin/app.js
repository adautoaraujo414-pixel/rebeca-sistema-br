// Verificar autenticação
const token = localStorage.getItem('token');
if (!token && !window.location.pathname.includes('login')) {
    window.location.href = '/admin/login';
}

// Configurar usuário
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

// Navegação
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
        case 'localidades': carregarLocalidades(); break;
        case 'precos': carregarPrecos(); break;
        case 'relatorios': carregarRelatorios(); break;
    }
}

// API Helper
async function api(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    if (data) options.body = JSON.stringify(data);
    try {
        const response = await fetch(url, options);
        return response.json();
    } catch (error) {
        console.error('Erro API:', error);
        return { error: 'Erro de conexão' };
    }
}

// ==================== DASHBOARD ====================
async function carregarDashboard() {
    const dashboard = await api('/api/rebeca/dashboard');
    document.getElementById('motoristasOnline').textContent = dashboard.motoristasOnline || 0;
    document.getElementById('corridasHoje').textContent = dashboard.corridasHoje || 0;
    document.getElementById('corridasPendentes').textContent = dashboard.corridasPendentes || 0;
    document.getElementById('faturamentoHoje').textContent = (dashboard.faturamentoHoje || 0).toFixed(2);
    
    const corridas = await api('/api/corridas/ativas');
    const tbody = document.getElementById('corridasAtivasTable');
    tbody.innerHTML = corridas.length ? corridas.map(c => `
        <tr>
            <td>${c.id.slice(-6)}</td>
            <td>${c.clienteNome || '-'}</td>
            <td>${c.motoristaNome || '<span class="badge yellow">Aguardando</span>'}</td>
            <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
            <td>
                ${c.status === 'pendente' ? `<button class="btn btn-primary btn-sm" onclick="atribuirMotorista('${c.id}')">Atribuir</button>` : ''}
                ${c.status === 'em_andamento' ? `<button class="btn btn-success btn-sm" onclick="finalizarCorrida('${c.id}')">Finalizar</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">Cancelar</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;">Nenhuma corrida ativa</td></tr>';
}

// ==================== MAPA ====================
let mapaLeaflet = null;
let marcadores = [];

async function carregarMapa() {
    const stats = await api('/api/gps-integrado/estatisticas');
    document.getElementById('mapaOnline').textContent = (stats.disponivel || 0) + (stats.em_corrida || 0);
    document.getElementById('mapaDisponiveis').textContent = stats.disponivel || 0;
    document.getElementById('mapaEmCorrida').textContent = stats.em_corrida || 0;
    
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
            const cor = m.status === 'disponivel' ? 'green' : m.status === 'em_corrida' ? 'blue' : 'gray';
            const icon = L.divIcon({
                html: `<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">🚗</div>`,
                className: 'custom-marker',
                iconSize: [30, 30]
            });
            
            const marker = L.marker([m.latitude, m.longitude], { icon })
                .addTo(mapaLeaflet)
                .bindPopup(`<b>${m.nome}</b><br>Status: ${formatStatus(m.status)}<br>📱 ${m.telefone || m.whatsapp || ''}`);
            
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
            <td>${c.origem?.endereco?.slice(0,25) || '-'}...</td>
            <td>${c.destino?.endereco?.slice(0,25) || '-'}...</td>
            <td>R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}</td>
            <td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td>
            <td>
                ${c.status === 'pendente' ? `<button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">Cancelar</button>` : ''}
            </td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhuma corrida encontrada</td></tr>';
}

async function cancelarCorrida(id) {
    if (confirm('Cancelar esta corrida?')) {
        await api('/api/corridas/' + id + '/cancelar', 'PUT', { motivo: 'Cancelado pelo admin' });
        carregarCorridas();
        carregarDashboard();
    }
}

async function finalizarCorrida(id) {
    if (confirm('Finalizar esta corrida?')) {
        await api('/api/corridas/' + id + '/finalizar', 'PUT', {});
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
            <td>📱 ${m.whatsapp || m.telefone}</td>
            <td>${m.veiculo?.modelo || ''} ${m.veiculo?.cor || ''}</td>
            <td><strong>${m.veiculo?.placa || '-'}</strong></td>
            <td><span class="badge ${getStatusColor(m.status)}">${formatStatus(m.status)}</span></td>
            <td>⭐ ${(m.avaliacao || 5).toFixed(1)}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="editarMotorista('${m.id}')">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="desativarMotorista('${m.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;color:#999;">Nenhum motorista encontrado</td></tr>';
}

function abrirModalMotorista() {
    document.getElementById('formMotorista').reset();
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
            ano: parseInt(document.getElementById('motVeiculoAno').value) || new Date().getFullYear()
        },
        senha: document.getElementById('motSenha').value.trim() || null
    };
    
    // Validações
    if (dados.nomeCompleto.length < 3) {
        alertDiv.innerHTML = '<div class="alert alert-error">Nome completo é obrigatório (mínimo 3 caracteres)</div>';
        return;
    }
    if (dados.whatsapp.replace(/\D/g, '').length < 10) {
        alertDiv.innerHTML = '<div class="alert alert-error">WhatsApp inválido</div>';
        return;
    }
    if (dados.cnh.length < 5) {
        alertDiv.innerHTML = '<div class="alert alert-error">Número da CNH é obrigatório</div>';
        return;
    }
    if (!dados.veiculo.modelo || !dados.veiculo.cor || !dados.veiculo.placa) {
        alertDiv.innerHTML = '<div class="alert alert-error">Preencha todos os dados do veículo</div>';
        return;
    }
    
    // Verificar WhatsApp duplicado
    const verificar = await api('/api/motoristas/verificar-whatsapp/' + dados.whatsapp.replace(/\D/g, ''));
    if (verificar.existe) {
        alertDiv.innerHTML = '<div class="alert alert-error">Este WhatsApp já está cadastrado!</div>';
        return;
    }
    
    const result = await api('/api/motoristas', 'POST', dados);
    
    if (result.error) {
        alertDiv.innerHTML = `<div class="alert alert-error">${result.error}</div>`;
        return;
    }
    
    // Sucesso - mostrar token
    document.getElementById('formMotorista').style.display = 'none';
    document.getElementById('tokenGerado').textContent = result.motorista.token;
    document.getElementById('senhaGerada').textContent = result.motorista.senhaGerada;
    document.getElementById('tokenMotoristaBox').style.display = 'block';
    
    carregarMotoristas();
});

async function desativarMotorista(id) {
    if (confirm('Desativar este motorista?')) {
        await api('/api/motoristas/' + id, 'DELETE');
        carregarMotoristas();
    }
}

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
    // Resetar form motorista
    if (id === 'modalMotorista') {
        document.getElementById('formMotorista').style.display = 'block';
        document.getElementById('tokenMotoristaBox').style.display = 'none';
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
                    : `<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${c.id}')">Bloquear</button>`
                }
            </td>
        </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:#999;">Nenhum cliente encontrado</td></tr>';
}

function abrirModalCliente() {
    document.getElementById('formCliente').reset();
    document.getElementById('modalCliente').classList.add('active');
}

document.getElementById('formCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cliente = {
        nome: document.getElementById('cliNome').value,
        telefone: document.getElementById('cliTelefone').value
    };
    await api('/api/clientes', 'POST', cliente);
    fecharModal('modalCliente');
    carregarClientes();
});

async function bloquearCliente(id) {
    if (confirm('Bloquear este cliente?')) {
        await api('/api/clientes/' + id + '/bloquear', 'PUT', { motivo: 'Bloqueado pelo admin' });
        carregarClientes();
    }
}

async function desbloquearCliente(id) {
    await api('/api/clientes/' + id + '/desbloquear', 'PUT');
    carregarClientes();
}

// ==================== LOCALIDADES ====================
async function carregarLocalidades() {
    const localidades = await api('/api/localidades');
    const tbody = document.getElementById('localidadesTable');
    tbody.innerHTML = localidades.length ? localidades.map(l => `
        <tr>
            <td>${l.nome}</td>
            <td>${l.distanciaBase} km</td>
            <td>R$ ${(l.taxaAdicional || 0).toFixed(2)}</td>
            <td><span class="badge ${l.ativo ? 'green' : 'red'}">${l.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td><button class="btn btn-danger btn-sm" onclick="excluirLocalidade('${l.id}')">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;">Nenhuma localidade</td></tr>';
}

function abrirModalLocalidade() {
    document.getElementById('formLocalidade').reset();
    document.getElementById('modalLocalidade').classList.add('active');
}

document.getElementById('formLocalidade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const localidade = {
        nome: document.getElementById('locNome').value,
        distanciaBase: parseFloat(document.getElementById('locDistancia').value),
        taxaAdicional: parseFloat(document.getElementById('locTaxa').value)
    };
    await api('/api/localidades', 'POST', localidade);
    fecharModal('modalLocalidade');
    carregarLocalidades();
});

async function excluirLocalidade(id) {
    if (confirm('Excluir esta localidade?')) {
        await api('/api/localidades/' + id, 'DELETE');
        carregarLocalidades();
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
            <td>${r.diasSemana?.join(', ') || 'Todos'}</td>
            <td><strong>${r.multiplicador}x</strong></td>
            <td><button class="btn btn-danger btn-sm" onclick="excluirRegra('${r.id}')">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;">Nenhuma regra</td></tr>';
}

async function salvarConfigPreco() {
    const config = {
        taxaBase: parseFloat(document.getElementById('taxaBase').value),
        precoKm: parseFloat(document.getElementById('precoKm').value),
        taxaMinima: parseFloat(document.getElementById('taxaMinima').value)
    };
    await api('/api/preco-dinamico/config', 'PUT', config);
    alert('Configuração salva!');
}

async function excluirRegra(id) {
    if (confirm('Excluir esta regra?')) {
        await api('/api/preco-dinamico/regras/' + id, 'DELETE');
        carregarPrecos();
    }
}

// ==================== RELATÓRIOS ====================
async function carregarRelatorios() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('relDataInicio').value = hoje;
    document.getElementById('relDataFim').value = hoje;
    gerarRelatorio();
}

async function gerarRelatorio() {
    const corridas = await api('/api/corridas');
    const finalizadas = corridas.filter(c => c.status === 'finalizada');
    
    document.getElementById('relTotalCorridas').textContent = finalizadas.length;
    document.getElementById('relFaturamento').textContent = finalizadas.reduce((s, c) => s + (c.precoFinal || 0), 0).toFixed(2);
    document.getElementById('relKmRodados').textContent = finalizadas.reduce((s, c) => s + (c.distanciaKm || 0), 0).toFixed(1);
    document.getElementById('relAvaliacao').textContent = '4.8';
}

// ==================== NOTIFICAÇÕES ====================
async function enviarNotificacao() {
    const destinatario = document.getElementById('notifDestinatario').value;
    const mensagem = document.getElementById('notifMensagem').value;
    
    if (!mensagem.trim()) {
        alert('Digite uma mensagem');
        return;
    }
    
    alert('Notificação enviada para: ' + destinatario);
    document.getElementById('notifMensagem').value = '';
}

// ==================== HELPERS ====================
function getStatusColor(status) {
    const colors = {
        'disponivel': 'green', 'online': 'green', 'ativo': 'green', 'finalizada': 'green',
        'em_corrida': 'blue', 'em_andamento': 'blue', 'aceita': 'blue',
        'pendente': 'yellow', 'a_caminho': 'yellow',
        'offline': 'red', 'cancelada': 'red', 'bloqueado': 'red', 'pausa': 'yellow'
    };
    return colors[status] || 'blue';
}

function formatStatus(status) {
    const nomes = {
        'disponivel': 'Disponível', 'em_corrida': 'Em Corrida', 'offline': 'Offline',
        'pendente': 'Pendente', 'aceita': 'Aceita', 'em_andamento': 'Em Andamento',
        'finalizada': 'Finalizada', 'cancelada': 'Cancelada', 'a_caminho': 'A Caminho', 'pausa': 'Pausado'
    };
    return nomes[status] || status;
}

// Fechar modal clicando fora
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal(modal.id);
    });
});

// Inicializar
carregarDashboard();
setInterval(carregarDashboard, 30000);
