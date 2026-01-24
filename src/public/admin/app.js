// Verificar autenticação
const token = localStorage.getItem('token');
if (!token && !window.location.pathname.includes('login')) {
    window.location.href = '/admin/login';
}

// Configurar usuário no header
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (usuario.nome) {
    document.getElementById('userName').textContent = usuario.nome;
    document.getElementById('userRole').textContent = usuario.role;
}

// Logout
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

// Carregar página
function carregarPagina(pagina) {
    switch(pagina) {
        case 'dashboard': carregarDashboard(); break;
        case 'corridas': carregarCorridas(); break;
        case 'motoristas': carregarMotoristas(); break;
        case 'clientes': carregarClientes(); break;
        case 'localidades': carregarLocalidades(); break;
        case 'precos': carregarPrecos(); break;
    }
}

// API Helper
async function api(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(url, options);
    return response.json();
}

// ==================== DASHBOARD ====================
async function carregarDashboard() {
    try {
        const dashboard = await api('/api/rebeca/dashboard');
        document.getElementById('motoristasOnline').textContent = dashboard.motoristasOnline || 0;
        document.getElementById('corridasHoje').textContent = dashboard.corridasHoje || 0;
        document.getElementById('corridasPendentes').textContent = dashboard.corridasPendentes || 0;
        document.getElementById('faturamentoHoje').textContent = (dashboard.faturamentoHoje || 0).toFixed(2);
        
        const corridas = await api('/api/corridas/ativas');
        const tbody = document.getElementById('corridasAtivasTable');
        tbody.innerHTML = corridas.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${c.clienteNome}</td>
                <td>${c.motoristaNome || '-'}</td>
                <td><span class="badge ${getStatusColor(c.status)}">${c.status}</span></td>
                <td>
                    ${c.status === 'pendente' ? `<button class="btn btn-primary" onclick="atribuirMotorista('${c.id}')">Atribuir</button>` : ''}
                    ${c.status === 'em_andamento' ? `<button class="btn btn-success" onclick="finalizarCorrida('${c.id}')">Finalizar</button>` : ''}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhuma corrida ativa</td></tr>';
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// ==================== CORRIDAS ====================
async function carregarCorridas() {
    const status = document.getElementById('filtroCorrida').value;
    const corridas = await api('/api/corridas' + (status ? '?status=' + status : ''));
    const tbody = document.getElementById('corridasTable');
    tbody.innerHTML = corridas.map(c => `
        <tr>
            <td>${c.id}</td>
            <td>${c.clienteNome}</td>
            <td>${c.origem?.endereco || '-'}</td>
            <td>${c.destino?.endereco || '-'}</td>
            <td>R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}</td>
            <td><span class="badge ${getStatusColor(c.status)}">${c.status}</span></td>
            <td>
                ${c.status === 'pendente' ? `<button class="btn btn-danger" onclick="cancelarCorrida('${c.id}')">Cancelar</button>` : ''}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhuma corrida encontrada</td></tr>';
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
    const motoristas = await api('/api/motoristas' + (busca ? '?busca=' + busca : ''));
    const tbody = document.getElementById('motoristasTable');
    tbody.innerHTML = motoristas.map(m => `
        <tr>
            <td>${m.nome}</td>
            <td>${m.telefone}</td>
            <td>${m.veiculo?.modelo || ''} ${m.veiculo?.cor || ''} - ${m.veiculo?.placa || ''}</td>
            <td><span class="badge ${getStatusColor(m.status)}">${m.status}</span></td>
            <td>⭐ ${m.avaliacao?.toFixed(1) || '5.0'}</td>
            <td>
                <button class="btn btn-primary" onclick="editarMotorista('${m.id}')">✏️</button>
                <button class="btn btn-danger" onclick="desativarMotorista('${m.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum motorista encontrado</td></tr>';
}

function abrirModalMotorista() {
    document.getElementById('formMotorista').reset();
    document.getElementById('modalMotorista').classList.add('active');
}

document.getElementById('formMotorista').addEventListener('submit', async (e) => {
    e.preventDefault();
    const motorista = {
        nome: document.getElementById('motNome').value,
        telefone: document.getElementById('motTelefone').value,
        email: document.getElementById('motEmail').value,
        veiculo: {
            modelo: document.getElementById('motVeiculoModelo').value,
            cor: document.getElementById('motVeiculoCor').value,
            placa: document.getElementById('motVeiculoPlaca').value
        }
    };
    await api('/api/motoristas', 'POST', motorista);
    fecharModal('modalMotorista');
    carregarMotoristas();
});

async function desativarMotorista(id) {
    if (confirm('Desativar este motorista?')) {
        await api('/api/motoristas/' + id, 'DELETE');
        carregarMotoristas();
    }
}

// ==================== CLIENTES ====================
async function carregarClientes() {
    const busca = document.getElementById('buscaCliente').value;
    const clientes = await api('/api/clientes' + (busca ? '?busca=' + busca : ''));
    const tbody = document.getElementById('clientesTable');
    tbody.innerHTML = clientes.map(c => `
        <tr>
            <td>${c.nome}</td>
            <td>${c.telefone}</td>
            <td>${c.corridasRealizadas || 0}</td>
            <td><span class="badge blue">${c.nivel?.nome || 'Novo'}</span></td>
            <td><span class="badge ${c.bloqueado ? 'red' : 'green'}">${c.bloqueado ? 'Bloqueado' : 'Ativo'}</span></td>
            <td>
                <button class="btn btn-primary" onclick="editarCliente('${c.id}')">✏️</button>
                ${c.bloqueado 
                    ? `<button class="btn btn-success" onclick="desbloquearCliente('${c.id}')">Desbloquear</button>`
                    : `<button class="btn btn-danger" onclick="bloquearCliente('${c.id}')">Bloquear</button>`
                }
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum cliente encontrado</td></tr>';
}

function abrirModalCliente() {
    document.getElementById('formCliente').reset();
    document.getElementById('modalCliente').classList.add('active');
}

document.getElementById('formCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cliente = {
        nome: document.getElementById('cliNome').value,
        telefone: document.getElementById('cliTelefone').value,
        email: document.getElementById('cliEmail').value
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
    tbody.innerHTML = localidades.map(l => `
        <tr>
            <td>${l.nome}</td>
            <td>${l.distanciaBase} km</td>
            <td>R$ ${(l.taxaAdicional || 0).toFixed(2)}</td>
            <td><span class="badge ${l.ativo ? 'green' : 'red'}">${l.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-primary" onclick="editarLocalidade('${l.id}')">✏️</button>
                <button class="btn btn-danger" onclick="excluirLocalidade('${l.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhuma localidade encontrada</td></tr>';
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
    document.getElementById('taxaBase').value = config.taxaBase;
    document.getElementById('precoKm').value = config.precoKm;
    document.getElementById('taxaMinima').value = config.taxaMinima;
    
    const regras = await api('/api/preco-dinamico/regras');
    const tbody = document.getElementById('regrasTable');
    tbody.innerHTML = regras.map(r => `
        <tr>
            <td>${r.nome}</td>
            <td>${r.horaInicio} - ${r.horaFim}</td>
            <td>${r.diasSemana?.join(', ') || 'Todos'}</td>
            <td>${r.multiplicador}x</td>
            <td>
                <button class="btn btn-danger" onclick="excluirRegra('${r.id}')">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhuma regra encontrada</td></tr>';
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

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Fechar modal clicando fora
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// Carregar dashboard inicial
carregarDashboard();

// Atualizar dashboard a cada 30 segundos
setInterval(carregarDashboard, 30000);
