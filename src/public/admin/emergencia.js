// ========== CONTATOS DE EMERGÊNCIA ==========

async function carregarEmergenciaAdmin() {
    try {
        const res = await fetch('/api/emergencia');
        const contatos = await res.json();
        
        const tbody = document.getElementById('emergenciaTable');
        tbody.innerHTML = contatos.map(c => `
            <tr>
                <td>${c.nome}</td>
                <td>${c.telefone}</td>
                <td>${getCategoriaLabel(c.categoria)}</td>
                <td>${c.descricao || '-'}</td>
                <td>${c.disponivel24h ? '✅ Sim' : '❌ Não'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editarContato('${c._id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="excluirContato('${c._id}')">🗑️</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum contato cadastrado</td></tr>';
    } catch (e) {
        console.error('Erro ao carregar contatos:', e);
    }
}

function getCategoriaLabel(cat) {
    const labels = {
        'admin': '👔 Admin',
        'mecanico': '🔧 Mecânico',
        'guincho': '🚛 Guincho',
        'borracheiro': '🛞 Borracheiro',
        'suporte': '💬 Suporte',
        'policia': '🚔 Polícia',
        'hospital': '🏥 Hospital',
        'outro': '📞 Outro'
    };
    return labels[cat] || cat;
}

async function salvarContato() {
    const contato = {
        nome: document.getElementById('emgNome').value,
        telefone: document.getElementById('emgTelefone').value,
        categoria: document.getElementById('emgCategoria').value,
        descricao: document.getElementById('emgDescricao').value,
        disponivel24h: document.getElementById('emgDisponivel24h').checked
    };

    if (!contato.nome || !contato.telefone) {
        alert('Preencha nome e telefone!');
        return;
    }

    const id = document.getElementById('emgId').value;
    const url = id ? `/api/emergencia/${id}` : '/api/emergencia';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contato)
        });
        const data = await res.json();
        if (data.sucesso) {
            alert('✅ Contato salvo!');
            fecharModal('modalEmergenciaAdmin');
            carregarEmergenciaAdmin();
            limparFormEmergencia();
        }
    } catch (e) {
        alert('❌ Erro ao salvar');
    }
}

async function editarContato(id) {
    try {
        const res = await fetch('/api/emergencia');
        const contatos = await res.json();
        const contato = contatos.find(c => c._id === id);
        
        if (contato) {
            document.getElementById('emgId').value = contato._id;
            document.getElementById('emgNome').value = contato.nome;
            document.getElementById('emgTelefone').value = contato.telefone;
            document.getElementById('emgCategoria').value = contato.categoria;
            document.getElementById('emgDescricao').value = contato.descricao || '';
            document.getElementById('emgDisponivel24h').checked = contato.disponivel24h;
            document.getElementById('modalEmergenciaAdmin').classList.add('active');
        }
    } catch (e) {}
}

async function excluirContato(id) {
    if (!confirm('Excluir este contato?')) return;
    
    try {
        await fetch(`/api/emergencia/${id}`, { method: 'DELETE' });
        alert('✅ Contato excluído!');
        carregarEmergenciaAdmin();
    } catch (e) {
        alert('❌ Erro ao excluir');
    }
}

function abrirModalNovoContato() {
    limparFormEmergencia();
    document.getElementById('modalEmergenciaAdmin').classList.add('active');
}

function limparFormEmergencia() {
    document.getElementById('emgId').value = '';
    document.getElementById('emgNome').value = '';
    document.getElementById('emgTelefone').value = '';
    document.getElementById('emgCategoria').value = 'outro';
    document.getElementById('emgDescricao').value = '';
    document.getElementById('emgDisponivel24h').checked = false;
}

// ========== INJETAR MENU E PÁGINA ==========
document.addEventListener('DOMContentLoaded', () => {
    // Adicionar menu após "Reclamações"
    const menuReclamacoes = document.querySelector('[data-page="reclamacoes"]');
    if (menuReclamacoes) {
        const menuEmergencia = document.createElement('div');
        menuEmergencia.className = 'menu-item';
        menuEmergencia.setAttribute('data-page', 'emergencia');
        menuEmergencia.innerHTML = '🆘 Emergência';
        menuEmergencia.onclick = () => {
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            menuEmergencia.classList.add('active');
            document.getElementById('emergencia').classList.add('active');
            carregarEmergenciaAdmin();
        };
        menuReclamacoes.insertAdjacentElement('afterend', menuEmergencia);
    }

    // Criar página
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        const pageEmergencia = document.createElement('div');
        pageEmergencia.id = 'emergencia';
        pageEmergencia.className = 'page';
        pageEmergencia.innerHTML = `
            <h2 style="margin-bottom:20px;">🆘 Contatos de Emergência</h2>
            <p style="color:#666;margin-bottom:20px;">Cadastre contatos que os motoristas podem acessar rapidamente pelo app.</p>
            
            <div class="panel">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3>📋 Contatos Cadastrados</h3>
                    <button class="btn btn-success" onclick="abrirModalNovoContato()">+ Novo Contato</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Telefone</th>
                            <th>Categoria</th>
                            <th>Descrição</th>
                            <th>24h?</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="emergenciaTable">
                        <tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
            
            <div class="panel">
                <h3>📱 Categorias Disponíveis</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px;margin-top:15px;">
                    <div class="card">👔 Admin/Dono</div>
                    <div class="card">🔧 Mecânico</div>
                    <div class="card">🚛 Guincho</div>
                    <div class="card">🛞 Borracheiro</div>
                    <div class="card">💬 Suporte</div>
                    <div class="card">🚔 Polícia</div>
                    <div class="card">🏥 Hospital</div>
                    <div class="card">📞 Outro</div>
                </div>
            </div>
        `;
        mainContent.appendChild(pageEmergencia);
    }

    // Modal
    const modalEmergencia = document.createElement('div');
    modalEmergencia.className = 'modal';
    modalEmergencia.id = 'modalEmergenciaAdmin';
    modalEmergencia.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🆘 Contato de Emergência</h3>
                <button class="modal-close" onclick="fecharModal('modalEmergenciaAdmin')">&times;</button>
            </div>
            <div style="padding:20px;">
                <input type="hidden" id="emgId">
                <div class="form-group">
                    <label>Nome *</label>
                    <input type="text" id="emgNome" class="form-control" placeholder="Ex: João Mecânico">
                </div>
                <div class="form-group">
                    <label>Telefone *</label>
                    <input type="tel" id="emgTelefone" class="form-control" placeholder="Ex: 11999999999">
                </div>
                <div class="form-group">
                    <label>Categoria</label>
                    <select id="emgCategoria" class="form-control">
                        <option value="admin">👔 Admin/Dono</option>
                        <option value="mecanico">🔧 Mecânico</option>
                        <option value="guincho">🚛 Guincho</option>
                        <option value="borracheiro">🛞 Borracheiro</option>
                        <option value="suporte">💬 Suporte</option>
                        <option value="policia">🚔 Polícia</option>
                        <option value="hospital">🏥 Hospital</option>
                        <option value="outro">📞 Outro</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Descrição</label>
                    <input type="text" id="emgDescricao" class="form-control" placeholder="Ex: Atende na zona sul">
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" id="emgDisponivel24h">
                    <label for="emgDisponivel24h" style="margin:0;">Disponível 24 horas</label>
                </div>
                <button class="btn btn-success" onclick="salvarContato()" style="width:100%;padding:12px;">💾 Salvar Contato</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalEmergencia);
});
