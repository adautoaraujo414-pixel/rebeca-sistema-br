// ========== MENSALIDADES ==========

async function carregarMensalidades() {
    try {
        const [mensalidades, stats, config] = await Promise.all([
            fetch('/api/mensalidades').then(r => r.json()),
            fetch('/api/mensalidades/estatisticas').then(r => r.json()),
            fetch('/api/mensalidades/config').then(r => r.json())
        ]);

        // Stats
        document.getElementById('mensTotal').textContent = stats.total || 0;
        document.getElementById('mensPagas').textContent = stats.pagas || 0;
        document.getElementById('mensPendentes').textContent = stats.pendentes || 0;
        document.getElementById('mensAtrasadas').textContent = stats.atrasadas || 0;
        document.getElementById('mensBloqueadas').textContent = stats.bloqueadas || 0;
        document.getElementById('mensFaturamento').textContent = 'R$ ' + (stats.faturamento || 0).toFixed(2);
        document.getElementById('mensValorPendente').textContent = 'R$ ' + (stats.valorPendente || 0).toFixed(2);

        // Config
        document.getElementById('cfgChavePix').value = config.chavePix || '';
        document.getElementById('cfgTipoChavePix').value = config.tipoChavePix || 'aleatoria';
        document.getElementById('cfgNomeTitular').value = config.nomeTitular || '';
        document.getElementById('cfgValorMensal').value = config.valorMensalidade || 100;
        document.getElementById('cfgValorSemanal').value = config.valorSemanal || 30;
        document.getElementById('cfgDiasTolerancia').value = config.diasTolerancia || 2;

        // Tabela
        const tbody = document.getElementById('mensalidadesTable');
        tbody.innerHTML = mensalidades.map(m => `
            <tr class="${m.status === 'bloqueado' ? 'row-blocked' : m.status === 'atrasado' ? 'row-warning' : ''}">
                <td>${m.motoristaNome}</td>
                <td>${m.motoristaWhatsapp}</td>
                <td>${m.plano === 'semanal' ? '📅 Semanal' : '📆 Mensal'}</td>
                <td>R$ ${m.valor.toFixed(2)}</td>
                <td>${new Date(m.dataVencimento).toLocaleDateString('pt-BR')}</td>
                <td>${getStatusBadge(m.status)}</td>
                <td>
                    ${m.status !== 'pago' ? `
                        <button class="btn btn-sm btn-success" onclick="confirmarPagamento('${m._id}')">✅ Confirmar</button>
                    ` : ''}
                    ${m.status === 'bloqueado' ? `
                        <button class="btn btn-sm btn-primary" onclick="desbloquearMotorista('${m.motoristaId}')">🔓 Desbloquear</button>
                    ` : ''}
                    ${m.status === 'atrasado' ? `
                        <button class="btn btn-sm btn-danger" onclick="bloquearMotorista('${m.motoristaId}')">🔒 Bloquear</button>
                    ` : ''}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhuma mensalidade</td></tr>';

    } catch (e) {
        console.error('Erro ao carregar mensalidades:', e);
    }
}

function getStatusBadge(status) {
    const badges = {
        'pago': '<span class="badge badge-success">✅ Pago</span>',
        'pendente': '<span class="badge badge-warning">⏳ Pendente</span>',
        'atrasado': '<span class="badge badge-danger">⚠️ Atrasado</span>',
        'bloqueado': '<span class="badge badge-dark">🔒 Bloqueado</span>'
    };
    return badges[status] || status;
}

async function salvarConfigFinanceiro() {
    const config = {
        chavePix: document.getElementById('cfgChavePix').value,
        tipoChavePix: document.getElementById('cfgTipoChavePix').value,
        nomeTitular: document.getElementById('cfgNomeTitular').value,
        valorMensalidade: parseFloat(document.getElementById('cfgValorMensal').value) || 100,
        valorSemanal: parseFloat(document.getElementById('cfgValorSemanal').value) || 30,
        diasTolerancia: parseInt(document.getElementById('cfgDiasTolerancia').value) || 2
    };

    try {
        const res = await fetch('/api/mensalidades/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await res.json();
        if (data.sucesso) {
            alert('✅ Configurações salvas!');
        }
    } catch (e) {
        alert('❌ Erro ao salvar');
    }
}

async function confirmarPagamento(mensalidadeId) {
    if (!confirm('Confirmar pagamento desta mensalidade?')) return;

    try {
        const res = await fetch(`/api/mensalidades/${mensalidadeId}/confirmar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ observacao: 'Confirmado pelo admin' })
        });
        const data = await res.json();
        if (data.sucesso) {
            alert('✅ Pagamento confirmado! Próxima mensalidade gerada automaticamente.');
            carregarMensalidades();
        }
    } catch (e) {
        alert('❌ Erro ao confirmar');
    }
}

async function bloquearMotorista(motoristaId) {
    if (!confirm('Bloquear este motorista por inadimplência?')) return;

    try {
        await fetch(`/api/mensalidades/bloquear/${motoristaId}`, { method: 'POST' });
        alert('🔒 Motorista bloqueado!');
        carregarMensalidades();
    } catch (e) {
        alert('❌ Erro ao bloquear');
    }
}

async function desbloquearMotorista(motoristaId) {
    if (!confirm('Desbloquear este motorista?')) return;

    try {
        await fetch(`/api/mensalidades/desbloquear/${motoristaId}`, { method: 'POST' });
        alert('🔓 Motorista desbloqueado!');
        carregarMensalidades();
    } catch (e) {
        alert('❌ Erro ao desbloquear');
    }
}

async function criarMensalidadeManual() {
    const motoristaId = document.getElementById('mensMotoristaId').value;
    const plano = document.getElementById('mensPlano').value;
    const valor = parseFloat(document.getElementById('mensValor').value);
    const dataVencimento = document.getElementById('mensDataVencimento').value;

    if (!motoristaId || !valor || !dataVencimento) {
        alert('Preencha todos os campos');
        return;
    }

    try {
        const res = await fetch('/api/mensalidades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motoristaId, plano, valor, dataVencimento })
        });
        const data = await res.json();
        if (data.sucesso) {
            alert('✅ Mensalidade criada!');
            fecharModal('modalNovaMensalidade');
            carregarMensalidades();
        }
    } catch (e) {
        alert('❌ Erro ao criar');
    }
}

async function verificarVencimentosManual() {
    try {
        const res = await fetch('/api/mensalidades/verificar-vencimentos', { method: 'POST' });
        const data = await res.json();
        alert(`✅ Verificação concluída! ${data.notificacoes?.length || 0} notificações.`);
        carregarMensalidades();
    } catch (e) {
        alert('❌ Erro');
    }
}

function filtrarMensalidades(status) {
    // Implementar filtro
    carregarMensalidades();
}

// ========== INJETAR MENU E PÁGINA MENSALIDADES ==========
document.addEventListener('DOMContentLoaded', () => {
    // Adicionar menu após "Preços Dinâmicos"
    const menuPrecos = document.querySelector('[data-page="precos"]');
    if (menuPrecos) {
        const menuMensalidades = document.createElement('div');
        menuMensalidades.className = 'menu-item';
        menuMensalidades.setAttribute('data-page', 'mensalidades');
        menuMensalidades.innerHTML = '💳 Mensalidades';
        menuMensalidades.onclick = () => {
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            menuMensalidades.classList.add('active');
            document.getElementById('mensalidades').classList.add('active');
            carregarMensalidades();
        };
        menuPrecos.insertAdjacentElement('afterend', menuMensalidades);
    }

    // Criar página de mensalidades
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        const pageMensalidades = document.createElement('div');
        pageMensalidades.id = 'mensalidades';
        pageMensalidades.className = 'page';
        pageMensalidades.innerHTML = `
            <h2 style="margin-bottom:20px;">💳 Mensalidades</h2>
            
            <!-- Cards Estatísticas -->
            <div class="cards">
                <div class="card blue"><div class="card-icon">📊</div><h3>Total</h3><div class="value" id="mensTotal">0</div></div>
                <div class="card green"><div class="card-icon">✅</div><h3>Pagas</h3><div class="value" id="mensPagas">0</div></div>
                <div class="card orange"><div class="card-icon">⏳</div><h3>Pendentes</h3><div class="value" id="mensPendentes">0</div></div>
                <div class="card red"><div class="card-icon">⚠️</div><h3>Atrasadas</h3><div class="value" id="mensAtrasadas">0</div></div>
                <div class="card purple"><div class="card-icon">🔒</div><h3>Bloqueadas</h3><div class="value" id="mensBloqueadas">0</div></div>
            </div>
            
            <div class="cards">
                <div class="card green"><div class="card-icon">💰</div><h3>Faturamento Total</h3><div class="value" id="mensFaturamento">R$ 0</div></div>
                <div class="card orange"><div class="card-icon">💸</div><h3>Valor Pendente</h3><div class="value" id="mensValorPendente">R$ 0</div></div>
            </div>

            <div class="panel-grid">
                <!-- Config Pix -->
                <div class="panel">
                    <h2>⚙️ Configurações de Pagamento</h2>
                    <div style="display:grid;gap:15px;">
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">Chave Pix</label>
                            <input type="text" id="cfgChavePix" class="form-control" placeholder="Sua chave Pix">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">Tipo da Chave</label>
                            <select id="cfgTipoChavePix" class="form-control">
                                <option value="cpf">CPF</option>
                                <option value="cnpj">CNPJ</option>
                                <option value="email">E-mail</option>
                                <option value="telefone">Telefone</option>
                                <option value="aleatoria">Aleatória</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">Nome do Titular</label>
                            <input type="text" id="cfgNomeTitular" class="form-control" placeholder="Nome que aparece no Pix">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div>
                                <label style="display:block;margin-bottom:5px;color:#666;">Valor Mensal (R$)</label>
                                <input type="number" id="cfgValorMensal" class="form-control" value="100">
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:5px;color:#666;">Valor Semanal (R$)</label>
                                <input type="number" id="cfgValorSemanal" class="form-control" value="30">
                            </div>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">Dias de Tolerância</label>
                            <input type="number" id="cfgDiasTolerancia" class="form-control" value="2">
                        </div>
                        <button class="btn btn-success" onclick="salvarConfigFinanceiro()" style="width:100%;">💾 Salvar Configurações</button>
                    </div>
                </div>

                <!-- Ações Rápidas -->
                <div class="panel">
                    <h2>⚡ Ações Rápidas</h2>
                    <div style="display:grid;gap:10px;">
                        <button class="btn btn-primary" onclick="abrirModalNovaMensalidade()" style="width:100%;padding:15px;">➕ Criar Mensalidade Manual</button>
                        <button class="btn btn-warning" onclick="verificarVencimentosManual()" style="width:100%;padding:15px;">🔔 Verificar Vencimentos Agora</button>
                        <button class="btn btn-info" onclick="filtrarMensalidades('atrasado')" style="width:100%;padding:15px;">⚠️ Ver Atrasadas</button>
                        <button class="btn btn-danger" onclick="filtrarMensalidades('bloqueado')" style="width:100%;padding:15px;">🔒 Ver Bloqueados</button>
                    </div>
                </div>
            </div>

            <!-- Tabela Mensalidades -->
            <div class="panel">
                <h2>📋 Todas as Mensalidades</h2>
                <div style="margin-bottom:15px;display:flex;gap:10px;">
                    <select id="filtroStatusMens" class="form-control" onchange="filtrarMensalidades(this.value)" style="width:200px;">
                        <option value="">Todos os Status</option>
                        <option value="pendente">Pendentes</option>
                        <option value="pago">Pagas</option>
                        <option value="atrasado">Atrasadas</option>
                        <option value="bloqueado">Bloqueadas</option>
                    </select>
                    <button class="btn btn-primary" onclick="carregarMensalidades()">🔄 Atualizar</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Motorista</th>
                            <th>WhatsApp</th>
                            <th>Plano</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="mensalidadesTable">
                        <tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        mainContent.appendChild(pageMensalidades);
    }

    // Modal Nova Mensalidade
    const modalNovaMens = document.createElement('div');
    modalNovaMens.className = 'modal';
    modalNovaMens.id = 'modalNovaMensalidade';
    modalNovaMens.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>➕ Nova Mensalidade</h3>
                <button class="modal-close" onclick="fecharModal('modalNovaMensalidade')">&times;</button>
            </div>
            <div style="padding:20px;">
                <div class="form-group">
                    <label>Motorista</label>
                    <select id="mensMotoristaId" class="form-control"></select>
                </div>
                <div class="form-group">
                    <label>Plano</label>
                    <select id="mensPlano" class="form-control">
                        <option value="mensal">Mensal</option>
                        <option value="semanal">Semanal</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Valor (R$)</label>
                    <input type="number" id="mensValor" class="form-control" step="0.01">
                </div>
                <div class="form-group">
                    <label>Data de Vencimento</label>
                    <input type="date" id="mensDataVencimento" class="form-control">
                </div>
                <button class="btn btn-success" onclick="criarMensalidadeManual()" style="width:100%;padding:12px;">✅ Criar Mensalidade</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalNovaMens);
});

async function abrirModalNovaMensalidade() {
    // Carregar motoristas
    try {
        const res = await fetch('/api/motoristas');
        const motoristas = await res.json();
        const select = document.getElementById('mensMotoristaId');
        select.innerHTML = motoristas.map(m => 
            `<option value="${m._id}">${m.nomeCompleto} - ${m.whatsapp}</option>`
        ).join('');
    } catch (e) {}
    
    // Preencher valor padrão
    const config = await fetch('/api/mensalidades/config').then(r => r.json());
    document.getElementById('mensValor').value = config.valorMensalidade || 100;
    
    // Data padrão: próximo mês
    const hoje = new Date();
    hoje.setMonth(hoje.getMonth() + 1);
    document.getElementById('mensDataVencimento').value = hoje.toISOString().split('T')[0];
    
    document.getElementById('modalNovaMensalidade').classList.add('active');
}

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
}
