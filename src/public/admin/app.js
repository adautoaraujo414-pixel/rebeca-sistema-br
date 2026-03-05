if (usuario.nome) { document.getElementById('userName').textContent = usuario.nome; document.getElementById('userRole').textContent = usuario.nivel || 'Admin'; }

function logout() { localStorage.clear(); window.location.href = '/admin/login'; }

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = item.getAttribute('data-page');
        document.getElementById(page).classList.add('active');
        // Para polling de centrais ao trocar de página
        if (typeof _pontosPollingInterval !== 'undefined' && _pontosPollingInterval) {
            clearInterval(_pontosPollingInterval);
            _pontosPollingInterval = null;
        }
        carregarPagina(page);
        // Inicia polling tempo real ao entrar em Centrais
        if (page === 'pontos') {
            _pontosPollingInterval = setInterval(carregarPontos, 5000);
        }
    });
});

function carregarPagina(p) {
    const fn = { dashboard:carregarDashboard, mapa:carregarMapa, corridas:carregarCorridas, despacho:carregarDespacho, motoristas:carregarMotoristas, clientes:carregarClientes, rotas:carregarRotas, faturamento:carregarFaturamento, precos:carregarPrecosSimples, ranking:carregarRanking, antifraude:carregarAntiFraude, blacklist:carregarBlacklist, reclamacoes:carregarReclamacoes, whatsapp:carregarWhatsApp, usuarios:carregarUsuarios, areas:carregarAreas, config:carregarConfig, logs:carregarLogs, fila:carregarFilaEspera, pontos:carregarPontos, empresa:carregarEmpresa };
    if (fn[p]) fn[p]();
}

async function api(url, method='GET', data=null) {
    const adminId = usuario._id || usuario.id || null;
    const opt = { method, headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token } };
    if (adminId) opt.headers['x-admin-id'] = adminId;
    if (data) opt.body = JSON.stringify(data);
    try { return await (await fetch(url, opt)).json(); } catch(e) { return { error:'Erro' }; }
}

// GRÁFICOS
let chartCorridas=null, chartFaturamento=null;
// ===== MOBILE: Toggle menu lateral =====
function toggleMenu() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('aberto');
}

// Fechar menu ao clicar em item (mobile)
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('aberto');
        }
    });
});

// Detectar mobile e ajustar automaticamente
function detectarMobile() {
    const isMobile = window.innerWidth <= 768;
    document.body.classList.toggle('is-mobile', isMobile);
    if (!isMobile) {
        document.querySelector('.sidebar')?.classList.remove('aberto');
    }
}
window.addEventListener('resize', detectarMobile);
detectarMobile();

function criarGraficoCorridas(d) { const ctx=document.getElementById('chartCorridas'); if(!ctx)return; if(chartCorridas)chartCorridas.destroy(); chartCorridas=new Chart(ctx,{type:'bar',data:{labels:d.map(x=>x.diaSemana),datasets:[{label:'Finalizadas',data:d.map(x=>x.finalizadas),backgroundColor:'#27ae60'},{label:'Canceladas',data:d.map(x=>x.canceladas),backgroundColor:'#e74c3c'}]},options:{responsive:true,maintainAspectRatio:false}}); }
function criarGraficoFaturamento(d) { const ctx=document.getElementById('chartFaturamento'); if(!ctx)return; if(chartFaturamento)chartFaturamento.destroy(); chartFaturamento=new Chart(ctx,{type:'line',data:{labels:d.map(x=>x.dataFormatada),datasets:[{label:'Faturamento',data:d.map(x=>x.faturamentoBruto),borderColor:'#27ae60',fill:true,backgroundColor:'rgba(39,174,96,0.1)'}]},options:{responsive:true,maintainAspectRatio:false}}); }

// DASHBOARD
async function carregarDashboard() {
    const dash = await api('/api/estatisticas/dashboard');
    const fraude = await api('/api/antifraude/estatisticas');
    document.getElementById('motoristasOnline').textContent = dash.motoristas?.online || 0;
    document.getElementById('corridasHoje').textContent = dash.corridas?.hoje || 0;
    document.getElementById('corridasPendentes').textContent = dash.corridas?.pendentes || 0;
    document.getElementById('faturamentoHoje').textContent = (dash.faturamento?.hoje?.bruto || 0).toFixed(2);
    document.getElementById('alertasFraude').textContent = fraude.alertas?.pendentes || 0;
    const cd = await api('/api/estatisticas/corridas-por-dia?dias=7'); criarGraficoCorridas(cd);
    const hr = await api('/api/estatisticas/horarios-pico');
    const picos = hr.filter(h=>h.corridas>0).sort((a,b)=>b.corridas-a.corridas).slice(0,8);
    const mx = Math.max(...picos.map(h=>h.corridas),1);
    document.getElementById('horariosPico').innerHTML = picos.map(h=>`<div class="pico-container"><span class="hora-label">${h.horaFormatada}</span><div class="pico-bar ${h.nivel}" style="width:${(h.corridas/mx)*200}px;"></div><span class="pico-value">${h.corridas}</span></div>`).join('') || '<p style="color:#999">Sem dados</p>';
    const top = await api('/api/estatisticas/ranking-motoristas?limite=5&periodo=semana');
    document.getElementById('topMotoristas').innerHTML = top.length ? top.map((m,i)=>`<div class="ranking-item"><div class="ranking-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':'normal'}">${m.posicao}</div><div class="ranking-info"><h4>${m.nome}</h4><small>${m.corridasRealizadas} corridas</small></div><div class="ranking-stats"><div class="valor">R$ ${m.faturamento.toFixed(2)}</div></div></div>`).join('') : '<p style="color:#999">Sem dados</p>';
    const at = await api('/api/corridas/ativas');
    document.getElementById('corridasAtivasTable').innerHTML = at.length ? at.slice(0,5).map(c=>`<tr><td>${c.clienteNome||'-'}</td><td>${c.motoristaNome||'<span class="badge yellow">Aguardando</span>'}</td><td><span class="badge ${getStatusColor(c.status)}">${formatStatus(c.status)}</span></td><td><button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${c.id}')">✕</button></td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#999">Nenhuma</td></tr>';
}

// MAPA
let mapaLeaflet=null, marcadores=[];
async function carregarMapa() {
    const st = await api('/api/motoristas/estatisticas');
    document.getElementById('mapaDisponiveis').textContent = st.disponiveis || 0;
    document.getElementById('mapaEmCorrida').textContent = st.emCorrida || 0;
    document.getElementById('mapaOffline').textContent = st.offline || 0;
    if (!mapaLeaflet) { mapaLeaflet = L.map('mapaLeaflet').setView([-20.0,-48.0],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaLeaflet); }
    atualizarMapa();
}
async function atualizarMapa() {
    if (!mapaLeaflet) return;
    marcadores.forEach(m=>mapaLeaflet.removeLayer(m)); marcadores=[];
    // Marcadores de centrais ativas
    try {
        const centrais = await api('/api/pontos');
        if (Array.isArray(centrais)) {
            const agora = new Date();
            const diaAtual = agora.getDay();
            const horaAtual = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
            centrais.forEach(c => {
                if (!c.lat || !c.lng) return;
                const estaAberto = c.ativo && (c.diasSemana||[]).includes(diaAtual) && horaAtual >= (c.horarioAbertura||'00:00') && horaAtual <= (c.horarioFechamento||'23:59');
                const corCentral = !c.ativo ? '#e74c3c' : estaAberto ? '#27ae60' : '#f39c12';
                const statusTxt = !c.ativo ? 'Fechada' : estaAberto ? '🟢 Aberta' : '🟡 Fora do horário';
                const icCentral = L.divIcon({
                    html: `<div style="background:${corCentral};width:36px;height:36px;border-radius:8px;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏢</div>`,
                    className: '', iconSize: [36, 36], iconAnchor: [18, 18]
                });
                const m = L.marker([c.lat, c.lng], { icon: icCentral })
                    .addTo(mapaLeaflet)
                    .bindPopup(`<div style="min-width:180px"><b style="font-size:1em;">🏢 ${c.nome}</b>${c.principal ? ' <span style="background:#9b59b6;color:white;padding:1px 6px;border-radius:8px;font-size:0.75em;">⭐ Principal</span>' : ''}<br><small style="color:#666">📍 ${c.endereco||''}</small><br><small>⏰ ${c.horarioAbertura||'06:00'} – ${c.horarioFechamento||'22:00'}</small><br><span style="color:${corCentral};font-weight:600;">${statusTxt}</span></div>`);
                marcadores.push(m);
            });
        }
    } catch(e) { console.log('Erro centrais no mapa:', e); }
    const mots = await api('/api/gps-integrado');
    // Auto-centralizar no primeiro motorista com GPS
    const motComGPS = mots.find(m => m.latitude && m.longitude);
    if (motComGPS && marcadores.length === 0) { mapaLeaflet.setView([motComGPS.latitude, motComGPS.longitude], 14); }
    mots.forEach(m => { if (m.latitude && m.longitude) { const cor = m.status==='disponivel'?'#27ae60':m.status==='em_corrida'?'#e74c3c':'#999'; const ic = L.divIcon({html:`<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;">🚗</div>`,className:'',iconSize:[30,30]}); marcadores.push(L.marker([m.latitude,m.longitude],{icon:ic}).addTo(mapaLeaflet).bindPopup(`<b>${m.nome}</b><br>${formatStatus(m.status)}`)); }});
}

// CORRIDAS
async function carregarCorridas() {
    const st = document.getElementById('filtroCorrida').value;
    const c = await api('/api/corridas'+(st?'?status='+st:''));
    document.getElementById('corridasTable').innerHTML = c.length ? c.map(x=>`<tr><td>${x.id.slice(-6)}</td><td>${x.clienteNome||'-'}</td><td>${(x.origem?.endereco||x.origem||'-').toString().slice(0,20)}...</td><td>${(x.destino?.endereco||x.destino||'-').toString().slice(0,20)}...</td><td>R$ ${(x.precoFinal||x.precoEstimado||0).toFixed(2)}</td><td><span class="badge ${getStatusColor(x.status)}">${formatStatus(x.status)}</span></td><td>${x.status==='pendente'?`<button class="btn btn-primary btn-sm" onclick="despacharCorrida('${x.id}')">📡</button> <button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${x.id}')">✕</button>`:''}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999">Nenhuma</td></tr>';
}
async function cancelarCorrida(id) { if (confirm('Cancelar?')) { await api('/api/corridas/'+id+'/cancelar','PUT',{motivo:'Admin'}); carregarCorridas(); carregarDashboard(); }}
async function despacharCorrida(id) { const r = await api('/api/despacho/despachar/'+id, 'POST'); if (r.sucesso) { alert(`✅ Despachada! Modo: ${r.modo}`); carregarCorridas(); } else alert('❌ '+r.error); }

// DESPACHO
async function carregarDespacho() {
    const cfg = await api('/api/despacho/config');
    const st = await api('/api/despacho/estatisticas');
    const mots = await api('/api/motoristas/estatisticas');
    document.getElementById('modoDespachoAtual').textContent = cfg.modo === 'broadcast' ? 'Broadcast' : 'Próximo';
    document.getElementById('aguardandoAceite').textContent = st.aguardandoAceite || 0;
    document.getElementById('aceitasHoje').textContent = st.aceitas || 0;
    document.getElementById('motoristasDespacho').textContent = mots.disponiveis || 0;
    document.getElementById('tempoAceite').value = cfg.tempoAceiteSegundos || 30;
    document.getElementById('modoBroadcast').classList.toggle('active', cfg.modo === 'broadcast');
    document.getElementById('modoProximo').classList.toggle('active', cfg.modo === 'proximo');
    // Carregar regras sequenciais
    regrasDespacho = cfg.regras || [{ tipo: 'broadcast', tempoEsperaSegundos: 30 }];
    renderizarRegras();
    const corridas = await api('/api/corridas?status=pendente');
    document.getElementById('corridasPendentesDespacho').innerHTML = corridas.length ? corridas.map(c=>`<div class="corrida-despacho aguardando"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${c.clienteNome||'Cliente'}</strong><br><small>📍 ${(c.origem?.endereco||c.origem||'').toString().slice(0,30)}...</small></div><div><button class="btn btn-primary btn-sm" onclick="despacharCorrida('${c.id}')">📡 Despachar</button></div></div></div>`).join('') : '<p style="color:#999;text-align:center;">Nenhuma pendente</p>';
}

// ===== REGRAS DE DESPACHO =====
let regrasDespacho = [];

const tipoLabels = {
    central: '🏢 Central',
    proximo: '📍 Mais Próximo',
    broadcast: '📢 Broadcast'
};
const tipoDesc = {
    central: 'Fila da central por ordem de chegada',
    proximo: 'Motorista com GPS mais próximo da origem',
    broadcast: 'Todos os motoristas disponíveis'
};
const tipoCores = {
    central: '#9b59b6',
    proximo: '#3498db',
    broadcast: '#27ae60'
};

function renderizarRegras() {
    const el = document.getElementById('regrasAtivas');
    if (!el) return;
    if (!regrasDespacho.length) {
        el.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Nenhuma regra configurada. Adicione pelo menos uma etapa.</p>';
        return;
    }
    el.innerHTML = regrasDespacho.map((r, i) => `
        <div style="background:white;border:2px solid ${tipoCores[r.tipo]};border-radius:10px;padding:15px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">
            <div style="background:${tipoCores[r.tipo]};color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0;">${i+1}</div>
            <div style="flex:1;">
                <div style="font-weight:bold;color:${tipoCores[r.tipo]};">${tipoLabels[r.tipo]}</div>
                <div style="font-size:0.82em;color:#666;">${tipoDesc[r.tipo]}</div>
                <div style="font-size:0.82em;color:#999;margin-top:2px;">⏱ Aguarda <strong>${r.tempoEsperaSegundos}s</strong> antes de avançar</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                ${i > 0 ? `<button onclick="moverRegra(${i},-1)" style="background:#eee;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;">▲</button>` : ''}
                ${i < regrasDespacho.length-1 ? `<button onclick="moverRegra(${i},1)" style="background:#eee;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;">▼</button>` : ''}
            </div>
            <button onclick="removerRegra(${i})" style="background:#e74c3c;color:white;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;">🗑</button>
        </div>
        ${i < regrasDespacho.length-1 ? '<div style="text-align:center;color:#999;font-size:0.8em;margin:-4px 0 6px;">⬇ se ninguém aceitar em ' + r.tempoEsperaSegundos + 's</div>' : ''}
    `).join('');
}

function adicionarRegra() {
    const tipo = document.getElementById('novaRegraTipo').value;
    const tempo = parseInt(document.getElementById('novaRegraTempo').value) || 30;
    // Broadcast só pode ser a última etapa
    if (tipo === 'broadcast' && regrasDespacho.some(r => r.tipo === 'broadcast')) {
        alert('Broadcast já adicionado. Só pode haver um broadcast, e deve ser a última etapa.');
        return;
    }
    regrasDespacho.push({ tipo, tempoEsperaSegundos: tempo });
    // Garantir broadcast sempre por último
    const bc = regrasDespacho.filter(r => r.tipo === 'broadcast');
    const outros = regrasDespacho.filter(r => r.tipo !== 'broadcast');
    regrasDespacho = [...outros, ...bc];
    renderizarRegras();
}

function removerRegra(i) {
    regrasDespacho.splice(i, 1);
    renderizarRegras();
}

function moverRegra(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= regrasDespacho.length) return;
    // Não mover broadcast para antes de outros
    if (regrasDespacho[i].tipo === 'broadcast' && dir < 0) return;
    if (regrasDespacho[j].tipo === 'broadcast' && dir > 0) return;
    [regrasDespacho[i], regrasDespacho[j]] = [regrasDespacho[j], regrasDespacho[i]];
    renderizarRegras();
}

async function salvarRegras() {
    if (!regrasDespacho.length) return alert('Adicione pelo menos uma regra antes de salvar.');
    try {
        await api('/api/despacho/config', { method: 'PUT', body: JSON.stringify({ regras: regrasDespacho }) });
        mostrarNotificacao('✅ Regras de despacho salvas!', 'success');
    } catch(e) { alert('Erro ao salvar: ' + e.message); }
}

async function carregarConfigDespacho() {
    try {
        const config = await api('/api/despacho/config');
        regrasDespacho = config.regras || [{ tipo: 'broadcast', tempoEsperaSegundos: 30 }];
        renderizarRegras();
        // Atualizar card de modo atual
        const el = document.getElementById('modoDespachoAtual');
        if (el) el.textContent = regrasDespacho.map(r => tipoLabels[r.tipo]).join(' → ');
    } catch(e) { console.log('Erro config despacho:', e); }
}

// Compatibilidade legada
async function setModoDespacho(modo) {
    regrasDespacho = [{ tipo: modo === 'proximo' ? 'proximo' : 'broadcast', tempoEsperaSegundos: 30 }];
    await salvarRegras();
    renderizarRegras();
}
async function salvarTempoAceite() {
    const t = parseInt(document.getElementById('tempoAceite')?.value) || 30;
    if (regrasDespacho[0]) regrasDespacho[0].tempoEsperaSegundos = t;
    await salvarRegras();
}

// MOTORISTAS
async function carregarMotoristas() {
    const b = document.getElementById('buscaMotorista').value;
    const s = document.getElementById('filtroStatusMotorista').value;
    let url = '/api/motoristas?'; if (b) url+='busca='+b+'&'; if (s) url+='status='+s;
    const m = await api(url);
    document.getElementById('motoristasTable').innerHTML = m.length ? m.map(x=>`<tr><td><strong>${x.nomeCompleto||x.nome}</strong></td><td>📱 ${x.whatsapp}</td><td>${x.veiculo?.modelo||''} ${x.veiculo?.cor||''}</td><td><strong>${x.veiculo?.placa||'-'}</strong></td><td><span class="badge ${getStatusColor(x.status)}">${formatStatus(x.status)}</span></td><td><button class="btn btn-danger btn-sm" onclick="desativarMotorista('${x._id||x.id}')">🗑️</button></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999">Nenhum</td></tr>';
}
function abrirModal(id) { document.getElementById(id).classList.add('active'); }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); }
function abrirModalMotorista() { document.getElementById('formMotorista').reset(); document.getElementById('formMotorista').style.display='block'; document.getElementById('tokenMotoristaBox').style.display='none'; document.getElementById('formMotoristaAlert').innerHTML=''; document.getElementById('modalMotorista').classList.add('active'); }
document.getElementById('formMotorista').addEventListener('submit', async(e)=>{ e.preventDefault(); const d={nomeCompleto:document.getElementById('motNome').value.trim(),whatsapp:document.getElementById('motWhatsApp').value.trim(),cpf:document.getElementById('motCPF').value.trim(),cnh:document.getElementById('motCNH').value.trim(),cidadeAtuacao:document.getElementById('motCidade').value.trim(),foto:document.getElementById('motFoto')?.value?.trim()||'',cnhValidade:document.getElementById('motCNHValidade').value,veiculo:{modelo:document.getElementById('motVeiculoModelo').value.trim(),cor:document.getElementById('motVeiculoCor').value.trim(),placa:document.getElementById('motVeiculoPlaca').value.trim().toUpperCase(),ano:parseInt(document.getElementById('motVeiculoAno').value)||2020},plano:document.getElementById('motPlano').value,valorMensalidade:parseFloat(document.getElementById('motValorMensalidade').value)||100,enviarWhatsApp:document.getElementById('motEnviarWhatsApp').checked,senhaPin:document.getElementById('motSenhaPin').value.trim()}; if(!d.nomeCompleto||!d.whatsapp||!d.cnh||!d.veiculo.modelo||!d.veiculo.cor||!d.veiculo.placa){document.getElementById('formMotoristaAlert').innerHTML='<div class="alert alert-error">Preencha campos obrigatórios</div>';return;} if(!d.senhaPin||d.senhaPin.length!==6||!/^[0-9]{6}$/.test(d.senhaPin)){document.getElementById('formMotoristaAlert').innerHTML='<div class="alert alert-error">PIN deve ter exatamente 6 números</div>';return;} const r=await api('/api/motoristas','POST',d); if(r.error){document.getElementById('formMotoristaAlert').innerHTML=`<div class="alert alert-error">${r.error}</div>`;return;} document.getElementById('formMotoristaAlert').innerHTML=''; document.getElementById('formMotorista').style.display='none'; document.getElementById('tokenGerado').textContent=r.motorista.token; document.getElementById('senhaGerada').textContent=r.senhaGerada; document.getElementById('tokenMotoristaBox').style.display='block'; carregarMotoristas(); });
async function desativarMotorista(id) { if (confirm('Desativar?')) { await api('/api/motoristas/'+id,'DELETE'); carregarMotoristas(); }}

// CLIENTES
async function carregarClientes() { const b=document.getElementById('buscaCliente').value; const c=await api('/api/clientes'+(b?'?busca='+b:'')); document.getElementById('clientesTable').innerHTML=c.length?c.map(x=>`<tr><td>${x.nome}</td><td>📱 ${x.telefone}</td><td>${x.corridasRealizadas||0}</td><td><span class="badge ${x.bloqueado?'red':'green'}">${x.bloqueado?'Bloqueado':'Ativo'}</span></td><td>${x.bloqueado?`<button class="btn btn-success btn-sm" onclick="desbloquearCliente('${x.id}')">Desbloquear</button>`:`<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${x.id}')">Bloquear</button>`}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhum</td></tr>'; }
function abrirModalCliente() { document.getElementById('formCliente').reset(); document.getElementById('modalCliente').classList.add('active'); }
document.getElementById('formCliente').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/clientes','POST',{nome:document.getElementById('cliNome').value,telefone:document.getElementById('cliTelefone').value}); fecharModal('modalCliente'); carregarClientes(); });
async function bloquearCliente(id) { if(confirm('Bloquear?')){ await api('/api/clientes/'+id+'/bloquear','PUT',{motivo:'Admin'}); carregarClientes(); }}
async function desbloquearCliente(id) { await api('/api/clientes/'+id+'/desbloquear','PUT'); carregarClientes(); }

// ROTAS
let mapaRotaLeaflet = null;
async function carregarRotas() { if (!mapaRotaLeaflet) { mapaRotaLeaflet = L.map('mapaGoogle').setView([-20.0,-48.0],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaRotaLeaflet); }}
async function calcularRota() {
    const origem = document.getElementById('rotaOrigem').value;
    const destino = document.getElementById('rotaDestino').value;
    if (!origem || !destino) { alert('Preencha origem e destino'); return; }
    const r = await api('/api/maps/calcular-preco','POST',{origem,destino});
    if (!r.sucesso) { alert(r.error || 'Erro'); return; }
    const faixa = await api('/api/preco-dinamico/faixa-atual');
    document.getElementById('rotaDistancia').textContent = r.distancia.texto;
    document.getElementById('rotaTempo').textContent = r.duracao.texto;
    document.getElementById('rotaPreco').textContent = 'R$ ' + r.preco.total.toFixed(2);
    document.getElementById('rotaFaixa').textContent = faixa.nome;
    document.getElementById('rotaTipo').textContent = faixa.tipo === 'fixo' ? `💵 FIXO R$ ${faixa.valorFixo}` : `📊 ${faixa.multiplicador}x`;
    document.getElementById('resultadoRota').style.display = 'block';
    if (mapaRotaLeaflet) {
        mapaRotaLeaflet.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline) mapaRotaLeaflet.removeLayer(l); });
        L.marker([r.origem.latitude,r.origem.longitude]).addTo(mapaRotaLeaflet).bindPopup('Origem');
        L.marker([r.destino.latitude,r.destino.longitude]).addTo(mapaRotaLeaflet).bindPopup('Destino');
        L.polyline([[r.origem.latitude,r.origem.longitude],[r.destino.latitude,r.destino.longitude]],{color:'#3498db',weight:4,dashArray:'10,10'}).addTo(mapaRotaLeaflet);
        mapaRotaLeaflet.fitBounds([[r.origem.latitude,r.origem.longitude],[r.destino.latitude,r.destino.longitude]],{padding:[50,50]});
    }
}
async function encontrarMotoristaProximo() {
    const origem = document.getElementById('rotaOrigem').value;
    if (!origem) { alert('Preencha a origem'); return; }
    const geo = await api('/api/maps/geocodificar','POST',{endereco:origem});
    if (!geo.sucesso) { alert('Erro ao localizar'); return; }
    const r = await api('/api/maps/motorista-proximo','POST',{latitude:geo.latitude,longitude:geo.longitude});
    document.getElementById('motoristaProximoInfo').innerHTML = r.sucesso ? `<p><strong>${r.motorista.nome}</strong> - ${r.distanciaKm.toFixed(1)} km (~${r.tempoEstimadoMinutos} min)</p>` : `<p style="color:#e74c3c">${r.error}</p>`;
    document.getElementById('motoristaProximo').style.display = 'block';
}

// FATURAMENTO
async function carregarFaturamento() { const r=await api('/api/estatisticas/faturamento-resumo'); document.getElementById('fatHoje').textContent=(r.hoje?.bruto||0).toFixed(2); document.getElementById('fatSemana').textContent=(r.semana?.bruto||0).toFixed(2); document.getElementById('fatMes').textContent=(r.mes?.bruto||0).toFixed(2); document.getElementById('fatComissao').textContent=(r.mes?.comissao||0).toFixed(2); const d=await api('/api/estatisticas/faturamento-por-dia?dias=30'); criarGraficoFaturamento(d); }

// ==================== PREÇOS DINÂMICOS ====================
let diaSelecionado = 'segunda';
let tipoPrecoSelecionado = 'multiplicador';
let tipoPrecoEditSelecionado = 'multiplicador';

async function carregarPrecos() {
    const cfg = await api('/api/preco-dinamico/config');
    // Preencher campos da aba 5
    const fields = { taxaBase:'taxaBase', precoKm:'precoKm', taxaMinima:'taxaMinima', taxaBandeira2:'taxaBandeira2', precoMinuto:'precoMinuto' };
    Object.entries(fields).forEach(([key, id]) => { const el = document.getElementById(id); if (el && cfg[key] !== undefined) el.value = cfg[key]; });
    const tBaseEl = document.getElementById('precoTaxaBase'); if (tBaseEl) tBaseEl.textContent = (cfg.taxaBase || 5).toFixed(2);
    const kmAtEl = document.getElementById('precoKmAtual'); if (kmAtEl) kmAtEl.textContent = (cfg.precoKm || 2.5).toFixed(2);
    const minEl = document.getElementById('precoMinimo'); if (minEl) minEl.textContent = (cfg.taxaMinima || 15).toFixed(2);
    document.getElementById('taxaBase').value = cfg.taxaBase || 5;
    document.getElementById('precoKm').value = cfg.precoKm || 2.5;
    document.getElementById('taxaMinima').value = cfg.taxaMinima || 15;
    document.getElementById('taxaBandeira2').value = cfg.taxaBandeira2 || 3;
    document.getElementById('precoMinuto').value = cfg.precoMinuto || 0.5;
    document.getElementById('precoTaxaBase').textContent = (cfg.taxaBase || 5).toFixed(2);
    document.getElementById('precoKmAtual').textContent = (cfg.precoKm || 2.5).toFixed(2);
    document.getElementById('precoMinimo').textContent = (cfg.taxaMinima || 15).toFixed(2);
    
    const faixaAtual = await api('/api/preco-dinamico/faixa-atual');
    let faixaTexto = faixaAtual.nome;
    if (faixaAtual.tipo === 'fixo' && faixaAtual.valorFixo > 0) {
        faixaTexto += ` (R$${faixaAtual.valorFixo})`;
    } else if (faixaAtual.multiplicador > 1) {
        faixaTexto += ` (${faixaAtual.multiplicador}x)`;
    }
    document.getElementById('faixaAtualNome').textContent = faixaTexto;
    
    carregarFaixasDia(diaSelecionado); carregarIntermunicipais();
}

function selecionarDia(dia) {
    diaSelecionado = dia;
    document.querySelectorAll('#tabsDias .tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    carregarFaixasDia(dia);
}

async function carregarFaixasDia(dia) {
    const faixas = await api('/api/preco-dinamico/faixas?dia=' + dia);
    
    if (!faixas.length) {
        document.getElementById('faixasHorario').innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Nenhuma faixa configurada.</p>';
        return;
    }
    
    document.getElementById('faixasHorario').innerHTML = faixas.map(f => {
        const isFixo = f.tipo === 'fixo' && f.valorFixo > 0;
        let nivel = 'normal';
        let cor = '#27ae60';
        let valorTexto = '';
        
        if (isFixo) {
            nivel = 'fixo';
            cor = '#9b59b6';
            valorTexto = `<div class="mult" style="color:${cor}">R$ ${f.valorFixo.toFixed(2)}</div><small>💵 VALOR FIXO</small>`;
        } else {
            nivel = f.multiplicador >= 1.4 ? 'alta' : f.multiplicador >= 1.2 ? 'media' : 'normal';
            cor = nivel === 'alta' ? '#e74c3c' : nivel === 'media' ? '#f39c12' : '#27ae60';
            valorTexto = `<div class="mult" style="color:${cor}">${f.multiplicador}x</div>${f.taxaAdicional > 0 ? `<small>+R$ ${f.taxaAdicional.toFixed(2)}</small>` : '<small>Sem taxa extra</small>'}`;
        }
        
        return `
            <div class="faixa-item ${nivel}">
                <div class="faixa-info">
                    <h4>${f.nome} ${isFixo ? '💵' : ''}</h4>
                    <small>⏰ ${f.horaInicio} - ${f.horaFim}</small>
                </div>
                <div class="faixa-valores">${valorTexto}</div>
                <div>
                    <button class="btn btn-primary btn-sm" onclick="abrirEditarFaixa('${f.id}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="excluirFaixa('${f.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

async function salvarConfigPreco() {
    const cfg = {
        taxaBase: parseFloat(document.getElementById('taxaBase').value),
        precoKm: parseFloat(document.getElementById('precoKm').value),
        taxaMinima: parseFloat(document.getElementById('taxaMinima').value),
        taxaBandeira2: parseFloat(document.getElementById('taxaBandeira2').value),
        precoMinuto: parseFloat(document.getElementById('precoMinuto').value)
    };
    await api('/api/preco-dinamico/config', 'PUT', cfg);
    alert('✅ Valores base salvos!');
    carregarPrecos();
}

// TIPO DE PREÇO - CRIAR
function selecionarTipoPreco(tipo) {
    tipoPrecoSelecionado = tipo;
    document.getElementById('faixaTipo').value = tipo;
    
    document.getElementById('tipoMult').classList.toggle('active', tipo === 'multiplicador');
    document.getElementById('tipoFixo').classList.toggle('active', tipo === 'fixo');
    
    document.getElementById('camposMultiplicador').classList.toggle('active', tipo === 'multiplicador');
    document.getElementById('camposFixo').classList.toggle('active', tipo === 'fixo');
}

// TIPO DE PREÇO - EDITAR
function selecionarTipoPrecoEdit(tipo) {
    tipoPrecoEditSelecionado = tipo;
    document.getElementById('editFaixaTipo').value = tipo;
    
    document.getElementById('editTipoMult').classList.toggle('active', tipo === 'multiplicador');
    document.getElementById('editTipoFixo').classList.toggle('active', tipo === 'fixo');
    
    document.getElementById('editCamposMultiplicador').classList.toggle('active', tipo === 'multiplicador');
    document.getElementById('editCamposFixo').classList.toggle('active', tipo === 'fixo');
}

function abrirModalFaixa() {
    document.getElementById('formFaixa').reset();
    selecionarTipoPreco('multiplicador');
    document.getElementById('faixaMult').value = '1.0';
    document.getElementById('faixaTaxa').value = '0';
    document.getElementById('faixaValorFixo').value = '30';
    document.getElementById('modalFaixa').classList.add('active');
}

document.getElementById('formFaixa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = document.getElementById('faixaTipo').value;
    const dados = {
        diaSemana: diaSelecionado,
        nome: document.getElementById('faixaNome').value,
        horaInicio: document.getElementById('faixaInicio').value,
        horaFim: document.getElementById('faixaFim').value,
        tipo: tipo,
        multiplicador: tipo === 'multiplicador' ? parseFloat(document.getElementById('faixaMult').value) : 1.0,
        taxaAdicional: tipo === 'multiplicador' ? parseFloat(document.getElementById('faixaTaxa').value) : 0,
        valorFixo: tipo === 'fixo' ? parseFloat(document.getElementById('faixaValorFixo').value) : 0
    };
    await api('/api/preco-dinamico/faixas', 'POST', dados);
    fecharModal('modalFaixa');
    carregarFaixasDia(diaSelecionado); carregarIntermunicipais();
    alert('✅ Faixa criada!');
});

async function abrirEditarFaixa(id) {
    const faixa = await api('/api/preco-dinamico/faixas/' + id);
    if (!faixa || faixa.error) { alert('Faixa não encontrada'); return; }
    
    document.getElementById('editFaixaId').value = faixa.id;
    document.getElementById('editFaixaNome').value = faixa.nome;
    document.getElementById('editFaixaInicio').value = faixa.horaInicio;
    document.getElementById('editFaixaFim').value = faixa.horaFim;
    document.getElementById('editFaixaMult').value = faixa.multiplicador || 1.0;
    document.getElementById('editFaixaTaxa').value = faixa.taxaAdicional || 0;
    document.getElementById('editFaixaValorFixo').value = faixa.valorFixo || 30;
    
    const tipo = (faixa.tipo === 'fixo' && faixa.valorFixo > 0) ? 'fixo' : 'multiplicador';
    selecionarTipoPrecoEdit(tipo);
    
    document.getElementById('modalEditarFaixa').classList.add('active');
}

document.getElementById('formEditarFaixa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editFaixaId').value;
    const tipo = document.getElementById('editFaixaTipo').value;
    const dados = {
        nome: document.getElementById('editFaixaNome').value,
        horaInicio: document.getElementById('editFaixaInicio').value,
        horaFim: document.getElementById('editFaixaFim').value,
        tipo: tipo,
        multiplicador: tipo === 'multiplicador' ? parseFloat(document.getElementById('editFaixaMult').value) : 1.0,
        taxaAdicional: tipo === 'multiplicador' ? parseFloat(document.getElementById('editFaixaTaxa').value) : 0,
        valorFixo: tipo === 'fixo' ? parseFloat(document.getElementById('editFaixaValorFixo').value) : 0
    };
    await api('/api/preco-dinamico/faixas/' + id, 'PUT', dados);
    fecharModal('modalEditarFaixa');
    carregarFaixasDia(diaSelecionado); carregarIntermunicipais();
    alert('✅ Faixa atualizada!');
});

async function excluirFaixa(id) {
    if (confirm('Excluir esta faixa?')) {
        await api('/api/preco-dinamico/faixas/' + id, 'DELETE');
        carregarFaixasDia(diaSelecionado); carregarIntermunicipais();
    }
}

function abrirModalCopiarFaixas() {
    document.getElementById('copiarOrigem').value = diaSelecionado;
    document.getElementById('modalCopiarFaixas').classList.add('active');
}

async function copiarFaixas() {
    const origem = document.getElementById('copiarOrigem').value;
    const destino = document.getElementById('copiarDestino').value;
    if (origem === destino) { alert('Selecione dias diferentes'); return; }
    await api('/api/preco-dinamico/faixas/copiar', 'POST', { diaOrigem: origem, diaDestino: destino });
    fecharModal('modalCopiarFaixas');
    alert('✅ Faixas copiadas!');
}

async function simularPrecos() {
    const km = parseFloat(document.getElementById('simularKm').value);
    const dia = document.getElementById('simularDia').value;
    const r = await api(`/api/preco-dinamico/simular/${km}/${dia}`);
    
    document.getElementById('resultadoSimulacao').innerHTML = `
        <h4>📊 Preços para ${km} km (${dia})</h4>
        <table style="width:100%;margin-top:10px;">
            <thead><tr><th>Faixa</th><th>Horário</th><th>Tipo</th><th>Preço</th></tr></thead>
            <tbody>
                ${r.map(f => `<tr>
                    <td>${f.faixa}</td>
                    <td>${f.horario}</td>
                    <td>${f.tipo === 'fixo' ? '<span class="badge purple">FIXO</span>' : `<span class="badge blue">${f.multiplicador}x</span>`}</td>
                    <td><strong style="color:#27ae60">R$ ${f.precoFinal.toFixed(2)}</strong></td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
}

// RANKING
async function carregarRanking() { const p=document.getElementById('rankingPeriodo').value; const m=await api('/api/estatisticas/ranking-motoristas?limite=10&periodo='+p); document.getElementById('rankingLista').innerHTML=m.length?m.map((x,i)=>`<div class="ranking-item"><div class="ranking-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':'normal'}">${x.posicao}</div><div class="ranking-info"><h4>${x.nome}</h4><small>${x.corridasRealizadas} corridas</small></div><div class="ranking-stats"><div class="valor">R$ ${x.faturamento.toFixed(2)}</div></div></div>`).join(''):'<p style="color:#999">Sem dados</p>'; }

// ANTI-FRAUDE
async function carregarAntiFraude() { const st=await api('/api/antifraude/estatisticas'); document.getElementById('fraudeCriticos').textContent=st.alertas?.porNivel?.critico||0; document.getElementById('fraudeAltos').textContent=st.alertas?.porNivel?.alto||0; document.getElementById('fraudePendentes').textContent=st.alertas?.pendentes||0; document.getElementById('fraudeResolvidos').textContent=st.alertas?.resolvidos||0; const a=await api('/api/antifraude/alertas'); document.getElementById('alertasFraudeLista').innerHTML=a.length?a.map(x=>`<div class="alerta-fraude ${x.nivel}"><div class="alerta-header"><strong>${x.entidadeNome}</strong> <span class="badge ${x.nivel==='critico'?'red':'orange'}">${x.nivel}</span></div><div class="alerta-motivos"><ul>${x.motivos.map(m=>`<li>⚠️ ${m}</li>`).join('')}</ul></div>${x.status!=='resolvido'?`<button class="btn btn-success btn-sm" onclick="resolverAlerta('${x.id}')">✅ Resolver</button>`:''}</div>`).join(''):'<p style="color:#999;padding:20px;">Nenhum</p>'; }
async function resolverAlerta(id) { const r=prompt('Resolução:'); if(r){await api('/api/antifraude/alertas/'+id+'/resolver','PUT',{resolucao:r}); carregarAntiFraude();} }

// BLACKLIST
async function carregarBlacklist() { const st=await api('/api/antifraude/estatisticas'); document.getElementById('blacklistTotal').textContent=st.blacklist?.total||0; document.getElementById('blacklistTelefones').textContent=st.blacklist?.porTipo?.telefone||0; document.getElementById('blacklistCPFs').textContent=st.blacklist?.porTipo?.cpf||0; const l=await api('/api/antifraude/blacklist'); document.getElementById('blacklistTable').innerHTML=l.length?l.map(x=>`<tr><td><span class="badge purple">${x.tipo}</span></td><td><strong>${x.valor}</strong></td><td>${x.motivo}</td><td>${new Date(x.dataBloqueio).toLocaleDateString('pt-BR')}</td><td><button class="btn btn-success btn-sm" onclick="removerBlacklist('${x.id}')">Remover</button></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhum</td></tr>'; }
function abrirModalBlacklist() { document.getElementById('formBlacklist').reset(); document.getElementById('modalBlacklist').classList.add('active'); }
document.getElementById('formBlacklist').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/antifraude/blacklist','POST',{tipo:document.getElementById('blTipo').value,valor:document.getElementById('blValor').value,motivo:document.getElementById('blMotivo').value}); fecharModal('modalBlacklist'); carregarBlacklist(); });
async function removerBlacklist(id) { if(confirm('Remover?')){ await api('/api/antifraude/blacklist/'+id,'DELETE'); carregarBlacklist(); }}

// RECLAMAÇÕES
async function carregarReclamacoes() { const st=await api('/api/reclamacoes/estatisticas'); document.getElementById('recPendentes').textContent=st.pendentes||0; document.getElementById('recAndamento').textContent=st.emAndamento||0; document.getElementById('recResolvidas').textContent=st.resolvidas||0; const r=await api('/api/reclamacoes'); document.getElementById('reclamacoesTable').innerHTML=r.length?r.map(x=>`<tr><td>${new Date(x.dataAbertura).toLocaleDateString('pt-BR')}</td><td>${x.clienteNome}</td><td>${x.assunto}</td><td><span class="badge ${x.status==='resolvida'?'green':'yellow'}">${x.status}</span></td><td>${x.status!=='resolvida'?`<button class="btn btn-success btn-sm" onclick="resolverReclamacao('${x.id}')">✓</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma</td></tr>'; }
function abrirModalReclamacao() { document.getElementById('formReclamacao').reset(); document.getElementById('modalReclamacao').classList.add('active'); }
document.getElementById('formReclamacao').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/reclamacoes','POST',{clienteNome:document.getElementById('recClienteNome').value,clienteTelefone:document.getElementById('recClienteTel').value,assunto:document.getElementById('recAssunto').value,descricao:document.getElementById('recDescricao').value}); fecharModal('modalReclamacao'); carregarReclamacoes(); });
async function resolverReclamacao(id) { const r=prompt('Resolução:'); if(r){await api('/api/reclamacoes/'+id+'/resolver','PUT',{resolucao:r}); carregarReclamacoes();} }

// WHATSAPP
async function carregarWhatsApp() {
    try {
        const c = await api('/api/config/whatsapp');
        const conectado = c?.conectado || false;
        // Campos de config (painel oculto)
        const apiUrlEl = document.getElementById('whatsappApiUrl');
        const apiKeyEl = document.getElementById('whatsappApiKey');
        const instEl = document.getElementById('whatsappInstancia');
        if (apiUrlEl) apiUrlEl.value = c?.apiUrl || '';
        if (apiKeyEl) apiKeyEl.value = c?.apiKey || '';
        if (instEl) instEl.value = c?.instancia || '';
        // Status badge visível
        const badge = document.getElementById('wppStatusBadge');
        const statusText = document.getElementById('wppStatusText');
        const btnGerar = document.getElementById('btnGerarQR');
        const btnDesc = document.getElementById('btnDesconectar');
        if (badge) { badge.style.background = conectado ? '#d4edda' : '#f8d7da'; badge.style.color = conectado ? '#155724' : '#721c24'; badge.innerHTML = conectado ? '🟢 Conectado' : '🔴 Desconectado'; }
        if (statusText) statusText.textContent = conectado ? 'Conectado' : 'Desconectado';
        if (btnGerar) btnGerar.style.display = conectado ? 'none' : 'inline-block';
        if (btnDesc) btnDesc.style.display = conectado ? 'inline-block' : 'none';
        // Contadores
        const motEl = document.getElementById('wppMotoristas');
        const msgEl = document.getElementById('wppMsgsHoje');
        if (motEl && c?.motoristas !== undefined) motEl.textContent = c.motoristas;
        if (msgEl && c?.msgsHoje !== undefined) msgEl.textContent = c.msgsHoje;
    } catch(e) { console.log('Erro carregarWhatsApp:', e); }
}
async function salvarConfigWhatsApp() { await api('/api/config/whatsapp','PUT',{apiUrl:document.getElementById('whatsappApiUrl').value,apiKey:document.getElementById('whatsappApiKey').value,instancia:document.getElementById('whatsappInstancia').value}); alert('Salvo!'); }

// USUÁRIOS
async function carregarUsuarios() { const st=await api('/api/usuarios/estatisticas'); document.getElementById('usrTotal').textContent=st.total||0; document.getElementById('usrAtivos').textContent=st.ativos||0; document.getElementById('usrSessoes').textContent=st.sessoesAtivas||0; const u=await api('/api/usuarios'); document.getElementById('usuariosTable').innerHTML=u.length?u.map(x=>`<tr><td><div style="display:flex;align-items:center;gap:10px;"><div class="user-avatar">${x.nome.charAt(0)}</div><strong>${x.nome}</strong></div></td><td>${x.login}</td><td>${x.email}</td><td><span class="badge ${x.nivel==='admin'?'red':'blue'}">${x.nivel}</span></td><td><span class="badge ${x.ativo?'green':'red'}">${x.ativo?'Ativo':'Inativo'}</span></td><td>${x.login!=='admin'?`<button class="btn btn-warning btn-sm" onclick="toggleUsuario('${x.id}',${x.ativo})">${x.ativo?'Desativar':'Ativar'}</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6">Nenhum</td></tr>'; }
function abrirModalUsuario() { document.getElementById('formUsuario').reset(); document.getElementById('formUsuario').style.display='block'; document.getElementById('usuarioCriado').style.display='none'; document.getElementById('formUsuarioAlert').innerHTML=''; document.getElementById('modalUsuario').classList.add('active'); }
document.getElementById('formUsuario').addEventListener('submit',async(e)=>{ e.preventDefault(); const d={nome:document.getElementById('usrNome').value,login:document.getElementById('usrLogin').value,email:document.getElementById('usrEmail').value,senha:document.getElementById('usrSenha').value||null,nivel:document.getElementById('usrNivel').value}; const r=await api('/api/usuarios','POST',d); if(r.error){document.getElementById('formUsuarioAlert').innerHTML=`<div class="alert alert-error">${r.error}</div>`;return;} document.getElementById('formUsuario').style.display='none'; document.getElementById('novoUsrLogin').textContent=r.login; document.getElementById('novoUsrSenha').textContent=r.senhaGerada||d.senha||'123456'; document.getElementById('usuarioCriado').style.display='block'; carregarUsuarios(); });
async function toggleUsuario(id,ativo) { await api('/api/usuarios/'+id+'/'+(ativo?'desativar':'ativar'),'PUT'); carregarUsuarios(); }

// ÁREAS
async function carregarAreas() { const a=await api('/api/config/areas'); document.getElementById('areasTable').innerHTML=a.length?a.map(x=>`<tr><td><strong>${x.nome}</strong></td><td>${x.cidade}</td><td>${x.bairros?.join(', ')||'-'}</td><td>R$ ${(x.taxaExtra||0).toFixed(2)}</td><td><button class="btn btn-danger btn-sm" onclick="excluirArea('${x.id}')">🗑️</button></td></tr>`).join(''):'<tr><td colspan="5">Nenhuma</td></tr>'; }
function abrirModalArea() { document.getElementById('formArea').reset(); document.getElementById('modalArea').classList.add('active'); }
document.getElementById('formArea').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/config/areas','POST',{nome:document.getElementById('areaNome').value,cidade:document.getElementById('areaCidade').value,bairros:document.getElementById('areaBairros').value.split(',').map(b=>b.trim()).filter(b=>b),taxaExtra:parseFloat(document.getElementById('areaTaxa').value)||0}); fecharModal('modalArea'); carregarAreas(); });
async function excluirArea(id) { if(confirm('Excluir?')){ await api('/api/config/areas/'+id,'DELETE'); carregarAreas(); }}

// CONFIG
async function carregarConfig() { const c=await api('/api/config'); document.getElementById('cfgTempoEspera').value=c.tempoMaximoEspera||10; document.getElementById('cfgRaioBusca').value=c.raioMaximoBusca||15; document.getElementById('cfgComissao').value=c.comissaoEmpresa||15; }
async function salvarConfiguracoes() { await api('/api/config','PUT',{tempoMaximoEspera:parseInt(document.getElementById('cfgTempoEspera').value),raioMaximoBusca:parseInt(document.getElementById('cfgRaioBusca').value),comissaoEmpresa:parseInt(document.getElementById('cfgComissao').value)}); alert('Salvo!'); }

// LOGS
async function carregarLogs() { const st=await api('/api/logs/estatisticas'); document.getElementById('logTotal').textContent=st.total||0; document.getElementById('logHoje').textContent=st.hoje||0; document.getElementById('logErros').textContent=st.porTipo?.erro||0; const l=await api('/api/logs?limite=50'); document.getElementById('logsLista').innerHTML=l.length?l.map(x=>`<div class="log-item"><span style="color:#999;font-size:0.85em;">${new Date(x.dataHora).toLocaleString('pt-BR')}</span> <strong>${x.acao}</strong> - ${x.usuarioNome||'Sistema'}</div>`).join(''):'<p style="color:#999">Nenhum</p>'; }

// HELPERS
function getStatusColor(s) { return {disponivel:'green',online:'green',finalizada:'green',resolvida:'green',em_corrida:'red',em_andamento:'blue',aceita:'blue',buscando_motorista:'blue',pendente:'yellow',a_caminho:'yellow',offline:'red',cancelada:'red',bloqueado:'red'}[s]||'blue'; }
function formatStatus(s) { return {disponivel:'Disponível',em_corrida:'Em Corrida',offline:'Offline',pendente:'Pendente',aceita:'Aceita',em_andamento:'Em Andamento',finalizada:'Finalizada',cancelada:'Cancelada',resolvida:'Resolvida',buscando_motorista:'Buscando'}[s]||s; }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); if(id==='modalMotorista'){document.getElementById('formMotorista').style.display='block';document.getElementById('tokenMotoristaBox').style.display='none';} if(id==='modalUsuario'){document.getElementById('formUsuario').style.display='block';document.getElementById('usuarioCriado').style.display='none';} }
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',(e)=>{if(e.target===m)fecharModal(m.id);}));

carregarDashboard();
setInterval(carregarDashboard, 30000);
setInterval(atualizarMapa, 10000); // Atualizar mapa a cada 10s

// ==================== INTERMUNICIPAIS ====================
async function carregarIntermunicipais() { const p=await api('/api/precos-intermunicipais'); document.getElementById('intermunicipaisTable').innerHTML=p.length?p.map(x=>`<tr><td>${x.cidadeOrigem}</td><td>${x.cidadeDestino}</td><td>${x.distanciaKm||'-'} km</td><td>R$ ${(x.precoFixo||0).toFixed(2)}</td><td><button class="btn btn-danger btn-sm" onclick="excluirIntermunicipal('${x._id}')">🗑️</button></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma rota cadastrada</td></tr>'; }
function abrirModalIntermunicipal() { document.getElementById('formIntermunicipal').reset(); abrirModal('modalIntermunicipal'); }
document.getElementById('formIntermunicipal').addEventListener('submit', async(e)=>{ e.preventDefault(); const d={cidadeOrigem:document.getElementById('intOrigem').value,cidadeDestino:document.getElementById('intDestino').value,distanciaKm:parseFloat(document.getElementById('intDistancia').value)||null,precoFixo:parseFloat(document.getElementById('intPreco').value),tempoEstimadoMin:parseInt(document.getElementById('intTempo').value)||null}; await api('/api/precos-intermunicipais','POST',d); fecharModal('modalIntermunicipal'); carregarIntermunicipais(); });
async function excluirIntermunicipal(id) { if(confirm('Excluir rota?')) { await api('/api/precos-intermunicipais/'+id,'DELETE'); carregarIntermunicipais(); }}

// ===== SISTEMA DE PONTOS =====
async function carregarFilaEspera() {
    try {
        const fila = await api('/api/fila-espera');
        const el = document.getElementById('filaEsperaContainer');
        if (!el) return;
        const lista = fila.fila || fila || [];
        if (!lista.length) { el.innerHTML = '<p style="color:#999;text-align:center;">Fila vazia</p>'; return; }
        el.innerHTML = `<table><thead><tr><th>#</th><th>Cliente</th><th>Origem</th><th>Aguardando</th><th>Ação</th></tr></thead><tbody>
        ${lista.map((f,i) => `<tr>
            <td>${i+1}</td>
            <td>${f.clienteNome||f.nome||'-'}</td>
            <td>${(f.origem?.endereco||f.origem||'-').toString().slice(0,30)}</td>
            <td>${f.criadoEm ? Math.round((Date.now()-new Date(f.criadoEm))/60000)+'min' : '-'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="removerFila('${f._id}')">✖ Remover</button></td>
        </tr>`).join('')}
        </tbody></table>`;
    } catch(e) { console.log('Erro fila:', e); }
}

async function removerFila(id) {
    if (!confirm('Remover da fila?')) return;
    await api('/api/fila-espera/' + id, 'DELETE');
    carregarFilaEspera();
}

async function abrirModalNovoPonto() {
    const nome = prompt('Nome da central/ponto:');
    if (!nome) return;
    const endereco = prompt('Endereço:');
    if (!endereco) return;
    await api('/api/pontos', 'POST', { nome, endereco, ativo: true });
    carregarPontos();
}

let _pontosPollingInterval = null;

async function carregarPontos() {
    try {
        const pontos = await api('/api/pontos');
        const el = document.getElementById('listaPontos');
        if (!el) return;
        const ts = document.getElementById('pontoUltimaAtualizacao');
        if (ts) ts.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});

        if (!Array.isArray(pontos) || !pontos.length) {
            el.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#999;">
                <div style="font-size:3em;margin-bottom:12px;">🏢</div>
                <p style="margin:0;font-size:1.1em;">Nenhuma central cadastrada</p>
                <p style="margin:8px 0 0;font-size:0.9em;">Clique em <strong>➕ Nova Central</strong> para começar</p>
            </div>`;
            return;
        }

        const agora = new Date();
        const diaAtual = agora.getDay();
        const horaAtual = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
        const diasNome = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

        el.innerHTML = pontos.map(p => {
            const diasFuncionamento = (p.diasSemana || [1,2,3,4,5]).map(d => diasNome[d]).join(', ');
            const estaAberto = p.ativo && (p.diasSemana || []).includes(diaAtual) && horaAtual >= (p.horarioAbertura||'00:00') && horaAtual <= (p.horarioFechamento||'23:59');
            const statusCor = !p.ativo ? '#e74c3c' : estaAberto ? '#27ae60' : '#f39c12';
            const statusTxt = !p.ativo ? '⛔ Fechado' : estaAberto ? '🟢 Aberto' : '🟡 Fora do horário';
            return `<div style="background:#fff;border-radius:10px;padding:0;margin-bottom:12px;border:1px solid #e8ecef;box-shadow:0 1px 4px rgba(0,0,0,0.06);overflow:hidden;">
                <div style="height:4px;background:${statusCor};"></div>
                <div style="padding:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:200px;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                <strong style="font-size:1.05em;color:#2c3e50;">${p.nome}</strong>
                                ${p.principal ? '<span style="background:#9b59b6;color:white;font-size:0.7em;padding:2px 7px;border-radius:10px;font-weight:600;">⭐ PRINCIPAL</span>' : ''}
                                <span style="background:${statusCor}22;color:${statusCor};font-size:0.75em;padding:2px 8px;border-radius:10px;font-weight:600;">${statusTxt}</span>
                            </div>
                            <div style="color:#555;font-size:0.88em;line-height:1.8;">
                                <div>📍 ${p.endereco || '-'}</div>
                                <div>⏰ ${p.horarioAbertura||'06:00'} – ${p.horarioFechamento||'22:00'} &nbsp;|&nbsp; 📅 ${diasFuncionamento}</div>
                                <div>⏱ Aceite: <strong>${p.tempoAceiteSegundos||30}s</strong> &nbsp;|&nbsp; 🚗 Máx por vez: <strong>${p.maxCorridasPonto||3}</strong></div>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;min-width:130px;">
                            <button class="btn btn-sm btn-primary" onclick="verFilaPonto('${p._id}','${p.nome.replace(/'/g,'\'')}')" style="text-align:left;">👥 Ver Fila</button>
                            ${p.ativo
                                ? `<button class="btn btn-sm" style="background:#e67e22;color:white;text-align:left;" onclick="fecharCentral('${p._id}')">🔒 Fechar Central</button>`
                                : `<button class="btn btn-sm" style="background:#27ae60;color:white;text-align:left;" onclick="abrirCentral('${p._id}')">🔓 Abrir Central</button>`
                            }
                            <button class="btn btn-sm btn-danger" onclick="deletarPonto('${p._id}','${p.nome.replace(/'/g,'\'')}')" style="text-align:left;">🗑 Excluir</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.log('Erro pontos:', e); }
}

function mostrarFormCentral() {
    document.getElementById('formCentralContainer').style.display = 'block';
    document.getElementById('btnNovaCentral').style.display = 'none';
    document.getElementById('pontoNome').focus();
}

function ocultarFormCentral() {
    document.getElementById('formCentralContainer').style.display = 'none';
    document.getElementById('btnNovaCentral').style.display = '';
    ['pontoNome','pontoEndereco'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}

async function fecharCentral(id) {
    await api('/api/pontos/' + id, 'PUT', { ativo: false });
    carregarPontos();
}

async function abrirCentral(id) {
    await api('/api/pontos/' + id, 'PUT', { ativo: true });
    carregarPontos();
}







async function criarPonto() {
    const nome = document.getElementById('pontoNome').value.trim();
    const endereco = document.getElementById('pontoEndereco').value.trim();
    if (!nome || !endereco) return alert('Preencha nome e endereço da central');
    const diasSemana = [...document.querySelectorAll('.dia-check:checked')].map(c => parseInt(c.value));
    const body = {
        nome, endereco,
        horarioAbertura: document.getElementById('pontoAbertura').value,
        horarioFechamento: document.getElementById('pontoFechamento').value,
        maxCorridasPonto: parseInt(document.getElementById('pontoMaxPonto').value) || 3,
        tempoAceiteSegundos: parseInt(document.getElementById('pontoTempoAceite').value) || 30,
        principal: document.getElementById('pontoPrincipal').checked,
        diasSemana
    };
    await api('/api/pontos', { method: 'POST', body: JSON.stringify(body) });
    carregarPontos();
    document.getElementById('pontoNome').value = '';
    document.getElementById('pontoEndereco').value = '';
    document.getElementById('pontoPrincipal').checked = false;
}



async function deletarPonto(id) {
    if (!confirm('Deletar ponto?')) return;
    await api(`/api/pontos/${id}`, { method: 'DELETE' });
    carregarPontos();
}

async function verFilaPonto(id, nome) {
    const fila = await api(`/api/pontos/${id}/fila`);
    alert(`Fila do ponto ${nome}:\n` + (fila.length ? fila.map((f,i) => `${i+1}. ${f.motoristaNome} — chegou ${new Date(f.chegadaEm).toLocaleTimeString('pt-BR')}`).join('\n') : 'Fila vazia'));
}

// ===== GPS ALTA PRECISÃO =====
let watchGPSId = null;

function iniciarGPSPreciso(callback) {
    if (!navigator.geolocation) return;
    const opcoes = {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 3000  // aceitar cache de até 3s
    };
    // Cancelar watch anterior
    if (watchGPSId) navigator.geolocation.clearWatch(watchGPSId);

    watchGPSId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy, speed, heading } = pos.coords;
            // Só usar se precisão < 50m
            if (accuracy > 50) {
                console.log('[GPS] Precisão baixa:', accuracy, 'm — aguardando melhor sinal');
                return;
            }
            callback({ latitude, longitude, accuracy, speed: speed || 0, heading: heading || 0 });
        },
        (err) => {
            console.log('[GPS] Erro:', err.message);
            // Fallback para posição única
            navigator.geolocation.getCurrentPosition(
                (pos) => callback({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                () => {},
                { enableHighAccuracy: false, timeout: 10000 }
            );
        },
        opcoes
    );
    return watchGPSId;
}


async function salvarConfigPreco() {
    try {
        const body = {
            taxaBase: parseFloat(document.getElementById('taxaBase')?.value || 5),
            precoKm: parseFloat(document.getElementById('precoKm')?.value || 2.5),
            taxaMinima: parseFloat(document.getElementById('taxaMinima')?.value || 15),
            taxaBandeira2: parseFloat(document.getElementById('taxaBandeira2')?.value || 3),
            precoMinuto: parseFloat(document.getElementById('precoMinuto')?.value || 0.5)
        };
        const r = await api('/api/preco-dinamico/config', 'POST', body);
        if (r?.sucesso || r?._id) {
            const btn = document.querySelector('[onclick="salvarConfigPreco()"]');
            if (btn) { const t = btn.textContent; btn.textContent = '✅ Salvo!'; setTimeout(() => btn.textContent = t, 2000); }
            carregarPrecos();
        } else { alert('Erro: ' + (r?.erro || r?.error || 'Tente novamente')); }
    } catch(e) { alert('Erro: ' + e.message); }
}

async function simularPreco() {
    const km = parseFloat(document.getElementById('simularKm')?.value || 5);
    const dia = document.getElementById('simularDia')?.value || 'semana';
    const el = document.getElementById('resultadoSimulacao');
    if (!el) return;
    try {
        const r = await api('/api/preco-dinamico/simular', 'POST', { km, dia });
        const preco = r?.precoTotal || r?.preco || r?.total || '—';
        const detalhes = r?.detalhes || '';
        el.style.display = 'block';
        el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-size:0.82em;color:#555;">Estimativa para <strong>' + km + ' km</strong> (' + dia + ')</div>' +
            (detalhes ? '<div style="font-size:0.8em;color:#888;margin-top:4px;">' + detalhes + '</div>' : '') + '</div>' +
            '<div style="font-size:2em;font-weight:800;color:#27ae60;">R$ ' + (typeof preco === 'number' ? preco.toFixed(2) : preco) + '</div></div>';
    } catch(e) {
        el.style.display = 'block';
        el.innerHTML = '<p style="color:#e74c3c;margin:0;">Erro ao simular: ' + e.message + '</p>';
    }
}

async function abrirModalFaixa() {
    const m = document.getElementById('modalFaixa');
    if (m) { m.classList.add('active'); }
    else {
        // Fallback: prompt simples
        const nome = prompt('Nome da faixa (ex: Pico Manhã):');
        if (!nome) return;
        const mult = parseFloat(prompt('Multiplicador (ex: 1.5 = 50% mais caro):') || '1');
        const horaInicio = prompt('Hora início (HH:MM):') || '07:00';
        const horaFim = prompt('Hora fim (HH:MM):') || '09:00';
        const r = await api('/api/preco-dinamico/faixas', 'POST', { nome, multiplicador: mult, horaInicio, horaFim });
        if (r?.sucesso || r?._id) carregarPrecos();
        else alert('Erro: ' + (r?.erro || 'Tente novamente'));
    }
}


// ==================== ZONAS DE PREÇO ====================

function abrirFormZona() {
    document.getElementById('formZona').style.display = 'block';
    document.getElementById('formZonaAlerta').style.display = 'none';
    document.getElementById('zonaNovoNome').focus();
}

function fecharFormZona() {
    document.getElementById('formZona').style.display = 'none';
    ['zonaNovoNome','zonaNovoPreco','zonaNovoEndereco','zonaNovoRaio','zonaNovoDescricao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'zonaNovoRaio' ? '2' : id === 'zonaNovoHoraInicio' ? '00:00' : id === 'zonaNovoHoraFim' ? '23:59' : '';
    });
    document.querySelectorAll('[name="zonaDias"]').forEach(c => c.checked = false);
}

async function carregarZonas() {
    const el = document.getElementById('listaZonas');
    const totalEl = document.getElementById('totalZonasAtivas');
    if (!el) return;
    try {
        const zonas = await api('/api/zona-preco');
        if (!Array.isArray(zonas) || zonas.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa;"><div style="font-size:2em;margin-bottom:8px;">🗺️</div><p>Nenhuma zona cadastrada ainda.</p><p style="font-size:0.85em;">Crie uma zona para definir preços fixos por localização.</p></div>';
            if (totalEl) totalEl.textContent = '0';
            return;
        }
        const ativas = zonas.filter(z => z.ativo).length;
        if (totalEl) totalEl.textContent = ativas + ' / ' + zonas.length;
        el.innerHTML = zonas.map(z => `
            <div style="border:1px solid ${z.ativo ? '#e0f0e0' : '#eee'};border-radius:10px;padding:16px;margin-bottom:12px;background:${z.ativo ? '#f8fff8' : '#fafafa'};">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <span style="font-size:1em;font-weight:700;color:#2c3e50;">${z.nome}</span>
                            <span style="font-size:0.75em;padding:2px 8px;border-radius:20px;font-weight:600;background:${z.ativo ? '#27ae60' : '#ccc'};color:white;">${z.ativo ? 'ATIVA' : 'INATIVA'}</span>
                        </div>
                        <div style="font-size:0.82em;color:#666;margin-bottom:4px;">📍 ${z.enderecoReferencia || 'Sem endereço de referência'} &nbsp;·&nbsp; 📏 Raio: ${z.raioKm} km</div>
                        <div style="font-size:0.82em;color:#666;margin-bottom:4px;">🕐 ${z.horaInicio || '00:00'} – ${z.horaFim || '23:59'} &nbsp;·&nbsp; ${(z.diasSemana && z.diasSemana.length > 0) ? '📅 ' + ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].filter((_,i) => z.diasSemana.includes(i)).join(', ') : '📅 Todos os dias'}</div>
                        ${z.descricao ? '<div style="font-size:0.8em;color:#888;font-style:italic;">' + z.descricao + '</div>' : ''}
                    </div>
                    <div style="text-align:right;margin-left:16px;">
                        <div style="font-size:1.6em;font-weight:800;color:#27ae60;">R$ ${(z.precoFixo || 0).toFixed(2)}</div>
                        <div style="font-size:0.75em;color:#888;margin-bottom:8px;">preço fixo</div>
                        <div style="display:flex;gap:6px;justify-content:flex-end;">
                            <button onclick="toggleZona('${z._id}', ${!z.ativo})" style="background:${z.ativo ? '#e74c3c' : '#27ae60'};color:white;border:none;padding:6px 12px;border-radius:6px;font-size:0.78em;cursor:pointer;font-weight:600;">${z.ativo ? '⏸ Desativar' : '▶ Ativar'}</button>
                            <button onclick="deletarZona('${z._id}', '${z.nome}')" style="background:#f0f0f0;color:#e74c3c;border:1px solid #fcc;padding:6px 12px;border-radius:6px;font-size:0.78em;cursor:pointer;font-weight:600;">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>`).join('');
    } catch(e) {
        el.innerHTML = '<p style="color:#e74c3c;padding:20px;">Erro ao carregar zonas: ' + e.message + '</p>';
    }
}

async function salvarNovaZona() {
    const nome = document.getElementById('zonaNovoNome')?.value?.trim();
    const preco = parseFloat(document.getElementById('zonaNovoPreco')?.value || 0);
    const endereco = document.getElementById('zonaNovoEndereco')?.value?.trim();
    const raio = parseFloat(document.getElementById('zonaNovoRaio')?.value || 2);
    const horaInicio = document.getElementById('zonaNovoHoraInicio')?.value || '00:00';
    const horaFim = document.getElementById('zonaNovoHoraFim')?.value || '23:59';
    const descricao = document.getElementById('zonaNovoDescricao')?.value?.trim() || '';
    const diasSemana = Array.from(document.querySelectorAll('[name="zonaDias"]:checked')).map(c => parseInt(c.value));

    const alertEl = document.getElementById('formZonaAlerta');
    const mostrarErro = (msg) => {
        alertEl.style.display = 'block';
        alertEl.style.background = '#ffeaea';
        alertEl.style.color = '#c0392b';
        alertEl.textContent = '⚠️ ' + msg;
    };

    if (!nome) return mostrarErro('Informe o nome da zona.');
    if (!preco || preco < 1) return mostrarErro('Informe um preço fixo válido.');
    if (!endereco) return mostrarErro('Informe o endereço central da zona.');
    if (!raio || raio < 0.1) return mostrarErro('Informe um raio válido (mín. 0.1 km).');

    alertEl.style.display = 'block';
    alertEl.style.background = '#fff8e1';
    alertEl.style.color = '#856404';
    alertEl.textContent = '⏳ Geocodificando endereço...';

    try {
        const r = await api('/api/zona-preco', 'POST', { nome, precoFixo: preco, enderecoReferencia: endereco, raioKm: raio, horaInicio, horaFim, diasSemana, descricao });
        if (r?.sucesso || r?._id) {
            alertEl.style.display = 'none';
            fecharFormZona();
            carregarZonas();
        } else {
            mostrarErro(r?.erro || r?.error || 'Erro ao criar zona. Tente novamente.');
        }
    } catch(e) { mostrarErro('Erro: ' + e.message); }
}

async function toggleZona(id, ativo) {
    try {
        const r = await api('/api/zona-preco/' + id, 'PUT', { ativo });
        if (r?.sucesso) carregarZonas();
        else alert('Erro: ' + (r?.erro || 'Tente novamente'));
    } catch(e) { alert('Erro: ' + e.message); }
}

async function deletarZona(id, nome) {
    if (!confirm('Deletar a zona "' + nome + '"? Essa ação não pode ser desfeita.')) return;
    try {
        const r = await api('/api/zona-preco/' + id, 'DELETE');
        if (r?.sucesso) carregarZonas();
        else alert('Erro: ' + (r?.erro || 'Tente novamente'));
    } catch(e) { alert('Erro: ' + e.message); }
}

// ==================== ABAS DE PREÇO ====================
function abaPreco(n) {
    [1,2,3,4,5,6].forEach(i => {
        const el = document.getElementById('abaPreco'+i);
        const btn = document.getElementById('abaPrecoBtn'+i);
        if (!el || !btn) return;
        if (i === n) {
            el.style.display = '';
            btn.style.color = '#3498db';
            btn.style.fontWeight = '700';
            btn.style.borderBottom = '3px solid #3498db';
        } else {
            el.style.display = 'none';
            btn.style.color = '#888';
            btn.style.fontWeight = '600';
            btn.style.borderBottom = 'none';
        }
    });
    if (n === 2) iniciarMapaZona();
    if (n === 2) carregarZonasPreco();
}

// ==================== MAPA DE ZONA ====================
let mapaZona = null, marcadorZona = null, circuloZona = null;
let zonaLatSelecionada = null, zonaLngSelecionada = null;

function iniciarMapaZona() {
    if (mapaZona) { setTimeout(() => mapaZona.invalidateSize(), 100); return; }
    setTimeout(() => {
        try {
            mapaZona = L.map('mapaZonaPreco').setView([-20.0, -48.0], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(mapaZona);

            mapaZona.on('click', function(e) {
                zonaLatSelecionada = e.latlng.lat;
                zonaLngSelecionada = e.latlng.lng;

                // Atualizar marcador
                if (marcadorZona) mapaZona.removeLayer(marcadorZona);
                marcadorZona = L.marker([zonaLatSelecionada, zonaLngSelecionada], {
                    icon: L.divIcon({ html: '<div style="background:#e74c3c;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>', className:'', iconSize:[14,14], iconAnchor:[7,7] })
                }).addTo(mapaZona);

                // Atualizar círculo
                atualizarCirculoZona();

                // Atualizar UI
                const coord = zonaLatSelecionada.toFixed(5) + ', ' + zonaLngSelecionada.toFixed(5);
                document.getElementById('zonaCoordDisplay').textContent = coord;
                document.getElementById('zonaCoordsTexto').textContent = coord;
                document.getElementById('zonaCoordsInfo').style.display = 'block';
            });

            // Carregar zonas existentes no mapa
            carregarZonasNoMapa();
        } catch(e) { console.log('Erro iniciar mapa zona:', e); }
    }, 200);
}

function atualizarCirculoZona() {
    if (!mapaZona || !zonaLatSelecionada) return;
    const raio = parseFloat(document.getElementById('zonaRaio')?.value || 2) * 1000;
    if (circuloZona) mapaZona.removeLayer(circuloZona);
    circuloZona = L.circle([zonaLatSelecionada, zonaLngSelecionada], {
        radius: raio, color: '#3498db', fillColor: '#3498db', fillOpacity: 0.15, weight: 2
    }).addTo(mapaZona);
}

async function carregarZonasNoMapa() {
    if (!mapaZona) return;
    try {
        const zonas = await api('/api/zona-preco');
        if (!Array.isArray(zonas)) return;
        zonas.forEach(z => {
            if (!z.lat || !z.lng) return;
            const cor = z.ativo ? '#27ae60' : '#999';
            L.circle([z.lat, z.lng], {
                radius: z.raioKm * 1000, color: cor, fillColor: cor, fillOpacity: 0.1, weight: 2, dashArray: '6,4'
            }).addTo(mapaZona).bindPopup(
                '<b>' + z.nome + '</b><br>R$ ' + z.precoFixo.toFixed(2) + ' fixo<br>Raio: ' + z.raioKm + ' km'
            );
            L.marker([z.lat, z.lng], {
                icon: L.divIcon({ html: '<div style="background:' + cor + ';color:white;padding:3px 6px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">R$ ' + z.precoFixo.toFixed(2) + '</div>', className:'', iconAnchor:[0,0] })
            }).addTo(mapaZona);
        });
    } catch(e) {}
}

async function salvarZonaPreco() {
    if (!zonaLatSelecionada) return alert('Clique no mapa para selecionar o centro da zona');
    const nome = document.getElementById('zonaNome').value.trim();
    const raioKm = parseFloat(document.getElementById('zonaRaio').value);
    const precoFixo = parseFloat(document.getElementById('zonaPreco').value);
    const horaInicio = document.getElementById('zonaHoraInicio').value;
    const horaFim = document.getElementById('zonaHoraFim').value;
    const descricao = document.getElementById('zonaDescricao').value.trim();
    const diasSemana = [...document.querySelectorAll('.zona-dia:checked')].map(c => parseInt(c.value));

    if (!nome) return alert('Informe o nome da zona');
    if (!raioKm || raioKm <= 0) return alert('Informe um raio válido');
    if (!precoFixo || precoFixo <= 0) return alert('Informe o preço fixo');

    const r = await api('/api/zona-preco', 'POST', {
        nome, lat: zonaLatSelecionada, lng: zonaLngSelecionada,
        raioKm, precoFixo, horaInicio, horaFim, diasSemana, descricao
    });
    if (r.sucesso) {
        alert('Zona salva com sucesso!');
        // Limpar form
        document.getElementById('zonaNome').value = '';
        document.getElementById('zonaPreco').value = '';
        document.getElementById('zonaDescricao').value = '';
        document.querySelectorAll('.zona-dia').forEach(c => c.checked = false);
        zonaLatSelecionada = null; zonaLngSelecionada = null;
        if (marcadorZona) { mapaZona.removeLayer(marcadorZona); marcadorZona = null; }
        if (circuloZona) { mapaZona.removeLayer(circuloZona); circuloZona = null; }
        document.getElementById('zonaCoordsInfo').style.display = 'none';
        document.getElementById('zonaCoordDisplay').textContent = 'Nenhum ponto selecionado';
        carregarZonasPreco();
        carregarZonasNoMapa();
    } else {
        alert('Erro: ' + (r.erro || 'Tente novamente'));
    }
}

async function carregarZonasPreco() {
    const el = document.getElementById('listaZonasPreco');
    if (!el) return;
    try {
        const zonas = await api('/api/zona-preco');
        if (!Array.isArray(zonas) || !zonas.length) {
            el.innerHTML = '<div style="text-align:center;padding:30px;color:#999;"><div style="font-size:2em;margin-bottom:8px;">📍</div><p>Nenhuma zona cadastrada</p></div>';
            return;
        }
        const diasNome = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        el.innerHTML = zonas.map(z => {
            const dias = z.diasSemana?.length ? z.diasSemana.map(d => diasNome[d]).join(', ') : 'Todos os dias';
            const horario = z.horaInicio === '00:00' && z.horaFim === '23:59' ? 'Horário integral' : z.horaInicio + ' – ' + z.horaFim;
            return '<div style="background:#fff;border:1px solid #e8ecef;border-radius:10px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">' +
                '<div style="flex:1;">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                        '<strong style="color:#2c3e50;">' + z.nome + '</strong>' +
                        '<span style="background:' + (z.ativo ? '#e8f8ef' : '#f5f5f5') + ';color:' + (z.ativo ? '#27ae60' : '#999') + ';font-size:0.72em;padding:2px 8px;border-radius:8px;font-weight:700;">' + (z.ativo ? '✅ Ativa' : '⏸ Inativa') + '</span>' +
                    '</div>' +
                    '<div style="font-size:0.82em;color:#666;line-height:1.8;">' +
                        '<span>📍 Raio: <strong>' + z.raioKm + ' km</strong></span> &nbsp;|&nbsp; ' +
                        '<span>💰 Preço fixo: <strong style="color:#27ae60;">R$ ' + z.precoFixo.toFixed(2) + '</strong></span><br>' +
                        '<span>📅 ' + dias + '</span> &nbsp;|&nbsp; <span>⏰ ' + horario + '</span>' +
                        (z.descricao ? '<br><span style="color:#888;">' + z.descricao + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button onclick="toggleZona(' + JSON.stringify(z._id) + ',' + !z.ativo + ')" style="background:' + (z.ativo ? '#e67e22' : '#27ae60') + ';color:white;border:none;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:0.82em;">' + (z.ativo ? '⏸ Pausar' : '▶ Ativar') + '</button>' +
                    '<button onclick="deletarZona(' + JSON.stringify(z._id) + ',' + JSON.stringify(z.nome) + ') style="background:#e74c3c;color:white;border:none;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:0.82em;">🗑 Excluir</button>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch(e) { console.log('Erro zonas:', e); }
}

async function toggleZona(id, ativo) {
    await api('/api/zona-preco/' + id, 'PUT', { ativo });
    carregarZonasPreco();
}

async function deletarZona(id, nome) {
    if (!confirm('Excluir a zona "' + nome + '"?')) return;
    await api('/api/zona-preco/' + id, 'DELETE');
    carregarZonasPreco();
}


async function salvarConfig() {
    try {
        const tempoMaximoEspera = parseFloat(document.getElementById('cfgTempoEspera')?.value || 10);
        const raioMaximoBusca = parseFloat(document.getElementById('cfgRaioBusca')?.value || 15);
        const comissaoEmpresa = parseFloat(document.getElementById('cfgComissao')?.value || 15);
        const r = await api('/api/config', 'POST', { tempoMaximoEspera, raioMaximoBusca, comissaoEmpresa });
        if (r?.sucesso || r?._id) {
            const btn = document.querySelector('[onclick="salvarConfig()"]');
            if (btn) { const t = btn.textContent; btn.textContent = '✅ Salvo!'; setTimeout(() => btn.textContent = t, 2000); }
        } else { alert('Erro ao salvar: ' + (r?.erro || 'Tente novamente')); }
    } catch(e) { alert('Erro: ' + e.message); }
}

async function salvarConfigWhatsApp() {
    try {
        const apiUrl = document.getElementById('whatsappApiUrl')?.value;
        const apiKey = document.getElementById('whatsappApiKey')?.value;
        const instancia = document.getElementById('whatsappInstancia')?.value;
        const r = await api('/api/config/whatsapp', 'POST', { apiUrl, apiKey, instancia });
        if (r?.sucesso || r?._id) alert('Configuração salva!');
        else alert('Erro: ' + (r?.erro || 'Tente novamente'));
    } catch(e) { alert('Erro: ' + e.message); }
}

async function abrirModalBlacklist() {
    const m = document.getElementById('modalBlacklist');
    if (m) m.style.display = 'flex';
    else alert('Modal de blacklist não encontrado');
}

async function abrirModalReclamacao() {
    const m = document.getElementById('modalReclamacao');
    if (m) m.style.display = 'flex';
    else alert('Modal de reclamação não encontrado');
}

async function abrirModalUsuario() {
    const m = document.getElementById('modalUsuario');
    if (m) m.style.display = 'flex';
    else alert('Modal de usuário não encontrado');
}

async function abrirModalArea() {
    const m = document.getElementById('modalArea');
    if (m) m.style.display = 'flex';
    else alert('Modal de área não encontrado');
}


async function carregarEmpresa() {
    try {
        const c = await api('/api/config');
        if (!c) return;
        const fields = {
            empresaNome: c.nomeEmpresa || c.nome || '',
            empresaTelefone: c.telefone || '',
            empresaHorario: c.horarioFuncionamento || '',
            empresaPagamento: c.formasPagamento || '',
            empresaBoasVindas: c.mensagemBoasVindas || '',
            empresaCidadeAtuacao: c.cidadeAtuacao || ''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    } catch(e) { console.log('Erro carregarEmpresa:', e); }
}
