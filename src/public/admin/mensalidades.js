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
