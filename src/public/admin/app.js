const token = localStorage.getItem('token');
if (!token && !window.location.pathname.includes('login')) window.location.href = '/admin/login';

const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (usuario.nome) {
    document.getElementById('userName').textContent = usuario.nome;
    document.getElementById('userRole').textContent = usuario.nivel || 'Admin';
}

function logout() { localStorage.clear(); window.location.href = '/admin/login'; }

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.getAttribute('data-page')).classList.add('active');
        carregarPagina(item.getAttribute('data-page'));
    });
});

function carregarPagina(p) {
    const fn = { dashboard:carregarDashboard, mapa:carregarMapa, corridas:carregarCorridas, motoristas:carregarMotoristas, clientes:carregarClientes, rotas:carregarRotas, faturamento:carregarFaturamento, ranking:carregarRanking, antifraude:carregarAntiFraude, blacklist:carregarBlacklist, reclamacoes:carregarReclamacoes, whatsapp:carregarWhatsApp, usuarios:carregarUsuarios, areas:carregarAreas, precos:carregarPrecos, mapconfig:carregarMapConfig, config:carregarConfig, logs:carregarLogs };
    if (fn[p]) fn[p]();
}

async function api(url, method='GET', data=null) {
    const opt = { method, headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token } };
    if (data) opt.body = JSON.stringify(data);
    try { return await (await fetch(url, opt)).json(); } catch(e) { return { error:'Erro' }; }
}

// GRÁFICOS
let chartCorridas=null, chartFaturamento=null;
function criarGraficoCorridas(d) {
    const ctx = document.getElementById('chartCorridas'); if (!ctx) return;
    if (chartCorridas) chartCorridas.destroy();
    chartCorridas = new Chart(ctx, { type:'bar', data:{ labels:d.map(x=>x.diaSemana), datasets:[{label:'Finalizadas',data:d.map(x=>x.finalizadas),backgroundColor:'#27ae60'},{label:'Canceladas',data:d.map(x=>x.canceladas),backgroundColor:'#e74c3c'}]}, options:{responsive:true,maintainAspectRatio:false}});
}
function criarGraficoFaturamento(d) {
    const ctx = document.getElementById('chartFaturamento'); if (!ctx) return;
    if (chartFaturamento) chartFaturamento.destroy();
    chartFaturamento = new Chart(ctx, { type:'line', data:{ labels:d.map(x=>x.dataFormatada), datasets:[{label:'Faturamento',data:d.map(x=>x.faturamentoBruto),borderColor:'#27ae60',fill:true,backgroundColor:'rgba(39,174,96,0.1)'},{label:'Comissão',data:d.map(x=>x.comissaoEmpresa),borderColor:'#9b59b6',fill:true,backgroundColor:'rgba(155,89,182,0.1)'}]}, options:{responsive:true,maintainAspectRatio:false}});
}

// DASHBOARD
async function carregarDashboard() {
    const dash = await api('/api/estatisticas/dashboard');
    const fraude = await api('/api/antifraude/estatisticas');
    document.getElementById('motoristasOnline').textContent = dash.motoristas?.online || 0;
    document.getElementById('corridasHoje').textContent = dash.corridas?.hoje || 0;
    document.getElementById('corridasPendentes').textContent = dash.corridas?.pendentes || 0;
    document.getElementById('faturamentoHoje').textContent = (dash.faturamento?.hoje?.bruto || 0).toFixed(2);
    document.getElementById('alertasFraude').textContent = fraude.alertas?.pendentes || 0;
    
    const cd = await api('/api/estatisticas/corridas-por-dia?dias=7');
    criarGraficoCorridas(cd);
    
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
    if (!mapaLeaflet) { mapaLeaflet = L.map('mapaLeaflet').setView([-23.5327,-46.7917],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaLeaflet); }
    atualizarMapa();
}
async function atualizarMapa() {
    if (!mapaLeaflet) return;
    marcadores.forEach(m=>mapaLeaflet.removeLayer(m)); marcadores=[];
    const mots = await api('/api/gps-integrado');
    mots.forEach(m => { if (m.latitude && m.longitude) { const cor = m.status==='disponivel'?'#27ae60':m.status==='em_corrida'?'#3498db':'#999'; const ic = L.divIcon({html:`<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;">🚗</div>`,className:'',iconSize:[30,30]}); marcadores.push(L.marker([m.latitude,m.longitude],{icon:ic}).addTo(mapaLeaflet).bindPopup(`<b>${m.nome}</b><br>${formatStatus(m.status)}`)); }});
}

// CORRIDAS
async function carregarCorridas() {
    const st = document.getElementById('filtroCorrida').value;
    const c = await api('/api/corridas'+(st?'?status='+st:''));
    document.getElementById('corridasTable').innerHTML = c.length ? c.map(x=>`<tr><td>${x.id.slice(-6)}</td><td>${x.clienteNome||'-'}</td><td>${(x.origem?.endereco||'-').slice(0,20)}...</td><td>${(x.destino?.endereco||'-').slice(0,20)}...</td><td>R$ ${(x.precoFinal||x.precoEstimado||0).toFixed(2)}</td><td><span class="badge ${getStatusColor(x.status)}">${formatStatus(x.status)}</span></td><td>${x.status==='pendente'?`<button class="btn btn-danger btn-sm" onclick="cancelarCorrida('${x.id}')">Cancelar</button>`:''}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999">Nenhuma</td></tr>';
}
async function cancelarCorrida(id) { if (confirm('Cancelar?')) { await api('/api/corridas/'+id+'/cancelar','PUT',{motivo:'Admin'}); carregarCorridas(); carregarDashboard(); }}

// MOTORISTAS
async function carregarMotoristas() {
    const b = document.getElementById('buscaMotorista').value;
    const s = document.getElementById('filtroStatusMotorista').value;
    let url = '/api/motoristas?'; if (b) url+='busca='+b+'&'; if (s) url+='status='+s;
    const m = await api(url);
    document.getElementById('motoristasTable').innerHTML = m.length ? m.map(x=>`<tr><td><strong>${x.nomeCompleto||x.nome}</strong></td><td>📱 ${x.whatsapp}</td><td>${x.veiculo?.modelo||''} ${x.veiculo?.cor||''}</td><td><strong>${x.veiculo?.placa||'-'}</strong></td><td><span class="badge ${getStatusColor(x.status)}">${formatStatus(x.status)}</span></td><td>⭐ ${(x.avaliacao||5).toFixed(1)}</td><td><button class="btn btn-danger btn-sm" onclick="desativarMotorista('${x.id}')">🗑️</button></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999">Nenhum</td></tr>';
}
function abrirModalMotorista() { document.getElementById('formMotorista').reset(); document.getElementById('formMotorista').style.display='block'; document.getElementById('tokenMotoristaBox').style.display='none'; document.getElementById('formMotoristaAlert').innerHTML=''; document.getElementById('modalMotorista').classList.add('active'); }
document.getElementById('formMotorista').addEventListener('submit', async(e)=>{ e.preventDefault(); const d={nomeCompleto:document.getElementById('motNome').value.trim(),whatsapp:document.getElementById('motWhatsApp').value.trim(),cpf:document.getElementById('motCPF').value.trim(),cnh:document.getElementById('motCNH').value.trim(),cnhValidade:document.getElementById('motCNHValidade').value,endereco:document.getElementById('motEndereco').value.trim(),veiculo:{modelo:document.getElementById('motVeiculoModelo').value.trim(),cor:document.getElementById('motVeiculoCor').value.trim(),placa:document.getElementById('motVeiculoPlaca').value.trim().toUpperCase(),ano:parseInt(document.getElementById('motVeiculoAno').value)||2020}}; if(!d.nomeCompleto||!d.whatsapp||!d.cnh||!d.veiculo.modelo||!d.veiculo.cor||!d.veiculo.placa){document.getElementById('formMotoristaAlert').innerHTML='<div class="alert alert-error">Preencha campos obrigatórios</div>';return;} const r=await api('/api/motoristas','POST',d); if(r.error){document.getElementById('formMotoristaAlert').innerHTML=`<div class="alert alert-error">${r.error}</div>`;return;} document.getElementById('formMotorista').style.display='none'; document.getElementById('tokenGerado').textContent=r.motorista.token; document.getElementById('senhaGerada').textContent=r.motorista.senhaGerada; document.getElementById('tokenMotoristaBox').style.display='block'; carregarMotoristas(); });
async function desativarMotorista(id) { if (confirm('Desativar?')) { await api('/api/motoristas/'+id,'DELETE'); carregarMotoristas(); }}

// CLIENTES
async function carregarClientes() { const b=document.getElementById('buscaCliente').value; const c=await api('/api/clientes'+(b?'?busca='+b:'')); document.getElementById('clientesTable').innerHTML=c.length?c.map(x=>`<tr><td>${x.nome}</td><td>📱 ${x.telefone}</td><td>${x.corridasRealizadas||0}</td><td><span class="badge blue">${x.nivel?.nome||'Novo'}</span></td><td><span class="badge ${x.bloqueado?'red':'green'}">${x.bloqueado?'Bloqueado':'Ativo'}</span></td><td>${x.bloqueado?`<button class="btn btn-success btn-sm" onclick="desbloquearCliente('${x.id}')">Desbloquear</button>`:`<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${x.id}')">Bloquear</button>`}</td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:#999">Nenhum</td></tr>'; }
function abrirModalCliente() { document.getElementById('formCliente').reset(); document.getElementById('modalCliente').classList.add('active'); }
document.getElementById('formCliente').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/clientes','POST',{nome:document.getElementById('cliNome').value,telefone:document.getElementById('cliTelefone').value}); fecharModal('modalCliente'); carregarClientes(); });
async function bloquearCliente(id) { if(confirm('Bloquear?')){ await api('/api/clientes/'+id+'/bloquear','PUT',{motivo:'Admin'}); carregarClientes(); }}
async function desbloquearCliente(id) { await api('/api/clientes/'+id+'/desbloquear','PUT'); carregarClientes(); }

// ROTAS / GOOGLE MAPS
let mapaRotaLeaflet = null;
async function carregarRotas() {
    if (!mapaRotaLeaflet) {
        mapaRotaLeaflet = L.map('mapaGoogle').setView([-23.5327,-46.7917],12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaRotaLeaflet);
    }
}
async function calcularRota() {
    const origem = document.getElementById('rotaOrigem').value;
    const destino = document.getElementById('rotaDestino').value;
    if (!origem || !destino) { alert('Preencha origem e destino'); return; }
    
    const r = await api('/api/maps/calcular-preco','POST',{origem,destino});
    if (!r.sucesso) { alert(r.error || 'Erro ao calcular rota'); return; }
    
    document.getElementById('rotaDistancia').textContent = r.distancia.texto;
    document.getElementById('rotaTempo').textContent = r.duracao.texto;
    document.getElementById('rotaPreco').textContent = 'R$ ' + r.preco.total.toFixed(2);
    document.getElementById('resultadoRota').style.display = 'block';
    
    // Mostrar no mapa
    if (mapaRotaLeaflet) {
        mapaRotaLeaflet.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline) mapaRotaLeaflet.removeLayer(l); });
        
        const icOrigem = L.divIcon({html:'<div style="background:#27ae60;width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">A</div>',className:'',iconSize:[30,30]});
        const icDestino = L.divIcon({html:'<div style="background:#e74c3c;width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">B</div>',className:'',iconSize:[30,30]});
        
        L.marker([r.origem.latitude,r.origem.longitude],{icon:icOrigem}).addTo(mapaRotaLeaflet).bindPopup('Origem: '+r.origem.endereco);
        L.marker([r.destino.latitude,r.destino.longitude],{icon:icDestino}).addTo(mapaRotaLeaflet).bindPopup('Destino: '+r.destino.endereco);
        
        L.polyline([[r.origem.latitude,r.origem.longitude],[r.destino.latitude,r.destino.longitude]],{color:'#3498db',weight:4,dashArray:'10,10'}).addTo(mapaRotaLeaflet);
        
        mapaRotaLeaflet.fitBounds([[r.origem.latitude,r.origem.longitude],[r.destino.latitude,r.destino.longitude]],{padding:[50,50]});
    }
}
async function encontrarMotoristaProximo() {
    const origem = document.getElementById('rotaOrigem').value;
    if (!origem) { alert('Preencha a origem'); return; }
    
    const geo = await api('/api/maps/geocodificar','POST',{endereco:origem});
    if (!geo.sucesso) { alert('Erro ao localizar endereço'); return; }
    
    const r = await api('/api/maps/motorista-proximo','POST',{latitude:geo.latitude,longitude:geo.longitude});
    if (!r.sucesso) { document.getElementById('motoristaProximoInfo').innerHTML = '<p style="color:#e74c3c">'+r.error+'</p>'; document.getElementById('motoristaProximo').style.display='block'; return; }
    
    document.getElementById('motoristaProximoInfo').innerHTML = `
        <div class="rota-detalhe"><span>Nome:</span><strong>${r.motorista.nome}</strong></div>
        <div class="rota-detalhe"><span>Distância:</span><strong>${r.distanciaKm.toFixed(1)} km</strong></div>
        <div class="rota-detalhe"><span>Tempo chegada:</span><strong>~${r.tempoEstimadoMinutos} min</strong></div>
        <div class="rota-detalhe"><span>Avaliação:</span><strong>⭐ ${(r.motorista.avaliacao||5).toFixed(1)}</strong></div>
    `;
    document.getElementById('motoristaProximo').style.display = 'block';
}

// FATURAMENTO
async function carregarFaturamento() {
    const r = await api('/api/estatisticas/faturamento-resumo');
    document.getElementById('fatHoje').textContent = (r.hoje?.bruto||0).toFixed(2);
    document.getElementById('fatSemana').textContent = (r.semana?.bruto||0).toFixed(2);
    document.getElementById('fatMes').textContent = (r.mes?.bruto||0).toFixed(2);
    document.getElementById('fatComissao').textContent = (r.mes?.comissao||0).toFixed(2);
    const d = await api('/api/estatisticas/faturamento-por-dia?dias=30');
    criarGraficoFaturamento(d);
}

// RANKING
async function carregarRanking() {
    const p = document.getElementById('rankingPeriodo').value;
    const m = await api('/api/estatisticas/ranking-motoristas?limite=10&periodo='+p);
    document.getElementById('rankingLista').innerHTML = m.length ? m.map((x,i)=>`<div class="ranking-item"><div class="ranking-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':'normal'}">${x.posicao}</div><div class="ranking-info"><h4>${x.nome}</h4><small>${x.corridasRealizadas} corridas | ${x.kmRodados.toFixed(1)} km</small></div><div class="ranking-stats"><div class="valor">R$ ${x.faturamento.toFixed(2)}</div></div></div>`).join('') : '<p style="color:#999">Sem dados</p>';
}

// ANTI-FRAUDE
async function carregarAntiFraude() {
    const st = await api('/api/antifraude/estatisticas');
    document.getElementById('fraudeCriticos').textContent = st.alertas?.porNivel?.critico||0;
    document.getElementById('fraudeAltos').textContent = st.alertas?.porNivel?.alto||0;
    document.getElementById('fraudePendentes').textContent = st.alertas?.pendentes||0;
    document.getElementById('fraudeResolvidos').textContent = st.alertas?.resolvidos||0;
    
    let url = '/api/antifraude/alertas?';
    const fs = document.getElementById('filtroFraudeStatus').value;
    const fn = document.getElementById('filtroFraudeNivel').value;
    if (fs) url += 'status='+fs+'&';
    if (fn) url += 'nivel='+fn;
    
    const a = await api(url);
    document.getElementById('alertasFraudeLista').innerHTML = a.length ? a.map(x=>`<div class="alerta-fraude ${x.nivel}"><div class="alerta-header"><div><strong>${x.entidadeNome}</strong> <span class="badge ${x.nivel==='critico'||x.nivel==='alto'?'red':x.nivel==='medio'?'orange':'green'}">${x.nivel.toUpperCase()}</span> <span class="badge ${x.status==='pendente'?'yellow':x.status==='analisando'?'blue':'green'}">${x.status}</span></div><small>${new Date(x.dataCriacao).toLocaleString('pt-BR')}</small></div><div class="alerta-motivos"><ul>${x.motivos.map(m=>`<li>⚠️ ${m}</li>`).join('')}</ul></div><div>${x.status==='pendente'?`<button class="btn btn-primary btn-sm" onclick="analisarAlerta('${x.id}')">🔍 Analisar</button>`:''} ${x.status==='analisando'?`<button class="btn btn-success btn-sm" onclick="resolverAlerta('${x.id}')">✅ Resolver</button> <button class="btn btn-danger btn-sm" onclick="bloquearPorAlerta('${x.id}')">🚫 Bloquear</button>`:''} ${x.status!=='resolvido'?`<button class="btn btn-warning btn-sm" onclick="ignorarAlerta('${x.id}')">❌ Ignorar</button>`:''}</div></div>`).join('') : '<p style="color:#999;padding:20px;">Nenhum alerta</p>';
}
async function analisarAlerta(id) { await api('/api/antifraude/alertas/'+id+'/analisar','PUT',{analisadoPor:usuario.nome||'Admin'}); carregarAntiFraude(); }
async function resolverAlerta(id) { const r=prompt('Resolução:'); if(r){await api('/api/antifraude/alertas/'+id+'/resolver','PUT',{resolucao:r}); carregarAntiFraude();} }
async function bloquearPorAlerta(id) { const r=prompt('Motivo:'); if(r){await api('/api/antifraude/alertas/'+id+'/resolver','PUT',{resolucao:r,acao:'bloquear'}); carregarAntiFraude(); carregarBlacklist();} }
async function ignorarAlerta(id) { const m=prompt('Motivo:'); if(m){await api('/api/antifraude/alertas/'+id+'/ignorar','PUT',{motivo:m}); carregarAntiFraude();} }

// BLACKLIST
async function carregarBlacklist() {
    const st = await api('/api/antifraude/estatisticas');
    document.getElementById('blacklistTotal').textContent = st.blacklist?.total||0;
    document.getElementById('blacklistTelefones').textContent = st.blacklist?.porTipo?.telefone||0;
    document.getElementById('blacklistCPFs').textContent = st.blacklist?.porTipo?.cpf||0;
    const l = await api('/api/antifraude/blacklist');
    document.getElementById('blacklistTable').innerHTML = l.length ? l.map(x=>`<tr><td><span class="badge purple">${x.tipo}</span></td><td><strong>${x.valor}</strong></td><td>${x.motivo}</td><td>${new Date(x.dataBloqueio).toLocaleDateString('pt-BR')}</td><td><button class="btn btn-success btn-sm" onclick="removerBlacklist('${x.id}')">Remover</button></td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">Nenhum</td></tr>';
}
function abrirModalBlacklist() { document.getElementById('formBlacklist').reset(); document.getElementById('modalBlacklist').classList.add('active'); }
document.getElementById('formBlacklist').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/antifraude/blacklist','POST',{tipo:document.getElementById('blTipo').value,valor:document.getElementById('blValor').value,motivo:document.getElementById('blMotivo').value}); fecharModal('modalBlacklist'); carregarBlacklist(); });
async function removerBlacklist(id) { if(confirm('Remover?')){ await api('/api/antifraude/blacklist/'+id,'DELETE'); carregarBlacklist(); }}

// RECLAMAÇÕES
async function carregarReclamacoes() {
    const st = await api('/api/reclamacoes/estatisticas');
    document.getElementById('recPendentes').textContent = st.pendentes||0;
    document.getElementById('recAndamento').textContent = st.emAndamento||0;
    document.getElementById('recResolvidas').textContent = st.resolvidas||0;
    const f = document.getElementById('filtroReclamacao').value;
    const r = await api('/api/reclamacoes'+(f?'?status='+f:''));
    document.getElementById('reclamacoesTable').innerHTML = r.length ? r.map(x=>`<tr><td>${new Date(x.dataAbertura).toLocaleDateString('pt-BR')}</td><td>${x.clienteNome}</td><td>${x.assunto}</td><td><span class="badge ${x.prioridade==='alta'?'red':x.prioridade==='media'?'yellow':'green'}">${x.prioridade}</span></td><td><span class="badge ${x.status==='resolvida'?'green':x.status==='em_andamento'?'yellow':'red'}">${x.status}</span></td><td>${x.status!=='resolvida'?`<button class="btn btn-success btn-sm" onclick="resolverReclamacao('${x.id}')">✓</button>`:''}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999">Nenhuma</td></tr>';
}
function abrirModalReclamacao() { document.getElementById('formReclamacao').reset(); document.getElementById('modalReclamacao').classList.add('active'); }
document.getElementById('formReclamacao').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/reclamacoes','POST',{clienteNome:document.getElementById('recClienteNome').value,clienteTelefone:document.getElementById('recClienteTel').value,tipo:document.getElementById('recTipo').value,prioridade:document.getElementById('recPrioridade').value,assunto:document.getElementById('recAssunto').value,descricao:document.getElementById('recDescricao').value}); fecharModal('modalReclamacao'); carregarReclamacoes(); });
async function resolverReclamacao(id) { const r=prompt('Resolução:'); if(r){await api('/api/reclamacoes/'+id+'/resolver','PUT',{resolucao:r}); carregarReclamacoes();} }

// WHATSAPP
async function carregarWhatsApp() {
    const c = await api('/api/config/whatsapp');
    document.getElementById('whatsappApiUrl').value = c.apiUrl||'';
    document.getElementById('whatsappApiKey').value = c.apiKey||'';
    document.getElementById('whatsappInstancia').value = c.instancia||'rebeca-taxi';
    document.getElementById('whatsappStatus').innerHTML = c.conectado ? '<p><span class="status-indicator online"></span> Conectado</p>' : '<p><span class="status-indicator offline"></span> Desconectado</p>';
}
async function salvarConfigWhatsApp() { await api('/api/config/whatsapp','PUT',{apiUrl:document.getElementById('whatsappApiUrl').value,apiKey:document.getElementById('whatsappApiKey').value,instancia:document.getElementById('whatsappInstancia').value}); alert('Salvo!'); }

// USUÁRIOS ADMIN
async function carregarUsuarios() {
    const st = await api('/api/usuarios/estatisticas');
    document.getElementById('usrTotal').textContent = st.total||0;
    document.getElementById('usrAtivos').textContent = st.ativos||0;
    document.getElementById('usrSessoes').textContent = st.sessoesAtivas||0;
    
    const u = await api('/api/usuarios');
    document.getElementById('usuariosTable').innerHTML = u.length ? u.map(x=>`<tr><td><div style="display:flex;align-items:center;gap:10px;"><div class="user-avatar">${x.nome.charAt(0)}</div><strong>${x.nome}</strong></div></td><td>${x.login}</td><td>${x.email}</td><td><span class="badge ${x.nivel==='admin'?'red':x.nivel==='gerente'?'purple':x.nivel==='financeiro'?'green':'blue'}">${x.nivel}</span></td><td>${x.ultimoAcesso?new Date(x.ultimoAcesso).toLocaleString('pt-BR'):'Nunca'}</td><td><span class="badge ${x.ativo?'green':'red'}">${x.ativo?'Ativo':'Inativo'}</span></td><td>${x.login!=='admin'?`${x.ativo?`<button class="btn btn-warning btn-sm" onclick="desativarUsuario('${x.id}')">Desativar</button>`:`<button class="btn btn-success btn-sm" onclick="ativarUsuario('${x.id}')">Ativar</button>`} <button class="btn btn-primary btn-sm" onclick="resetarSenhaUsuario('${x.id}')">🔑</button>`:''}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#999">Nenhum</td></tr>';
}
function abrirModalUsuario() { document.getElementById('formUsuario').reset(); document.getElementById('formUsuario').style.display='block'; document.getElementById('usuarioCriado').style.display='none'; document.getElementById('formUsuarioAlert').innerHTML=''; document.getElementById('modalUsuario').classList.add('active'); }
document.getElementById('formUsuario').addEventListener('submit',async(e)=>{ e.preventDefault(); const d={nome:document.getElementById('usrNome').value,login:document.getElementById('usrLogin').value,email:document.getElementById('usrEmail').value,senha:document.getElementById('usrSenha').value||null,telefone:document.getElementById('usrTelefone').value,nivel:document.getElementById('usrNivel').value}; const r=await api('/api/usuarios','POST',d); if(r.error){document.getElementById('formUsuarioAlert').innerHTML=`<div class="alert alert-error">${r.error}</div>`;return;} document.getElementById('formUsuario').style.display='none'; document.getElementById('novoUsrLogin').textContent=r.login; document.getElementById('novoUsrSenha').textContent=r.senhaGerada||d.senha||'123456'; document.getElementById('usuarioCriado').style.display='block'; carregarUsuarios(); });
async function desativarUsuario(id) { if(confirm('Desativar?')){ await api('/api/usuarios/'+id+'/desativar','PUT'); carregarUsuarios(); }}
async function ativarUsuario(id) { await api('/api/usuarios/'+id+'/ativar','PUT'); carregarUsuarios(); }
async function resetarSenhaUsuario(id) { if(confirm('Resetar senha?')){ const r=await api('/api/usuarios/'+id+'/resetar-senha','POST'); if(r.novaSenha) alert('Nova senha: '+r.novaSenha); carregarUsuarios(); }}

// ÁREAS
async function carregarAreas() {
    const a = await api('/api/config/areas');
    document.getElementById('areasTable').innerHTML = a.length ? a.map(x=>`<tr><td><strong>${x.nome}</strong></td><td>${x.cidade}</td><td>${x.bairros?.join(', ')||'-'}</td><td>R$ ${(x.taxaExtra||0).toFixed(2)}</td><td><span class="badge ${x.ativo?'green':'red'}">${x.ativo?'Ativo':'Inativo'}</span></td><td><button class="btn btn-danger btn-sm" onclick="excluirArea('${x.id}')">🗑️</button></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#999">Nenhuma</td></tr>';
}
function abrirModalArea() { document.getElementById('formArea').reset(); document.getElementById('modalArea').classList.add('active'); }
document.getElementById('formArea').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/config/areas','POST',{nome:document.getElementById('areaNome').value,cidade:document.getElementById('areaCidade').value,bairros:document.getElementById('areaBairros').value.split(',').map(b=>b.trim()).filter(b=>b),taxaExtra:parseFloat(document.getElementById('areaTaxa').value)||0}); fecharModal('modalArea'); carregarAreas(); });
async function excluirArea(id) { if(confirm('Excluir?')){ await api('/api/config/areas/'+id,'DELETE'); carregarAreas(); }}

// PREÇOS
async function carregarPrecos() {
    const c = await api('/api/preco-dinamico/config');
    document.getElementById('taxaBase').value = c.taxaBase||5;
    document.getElementById('precoKm').value = c.precoKm||2.5;
    document.getElementById('taxaMinima').value = c.taxaMinima||15;
}
async function salvarConfigPreco() { await api('/api/preco-dinamico/config','PUT',{taxaBase:parseFloat(document.getElementById('taxaBase').value),precoKm:parseFloat(document.getElementById('precoKm').value),taxaMinima:parseFloat(document.getElementById('taxaMinima').value)}); alert('Salvo!'); }

// CONFIG MAPS
async function carregarMapConfig() {
    const c = await api('/api/maps/config');
    document.getElementById('googleMapsKey').value = c.apiKey === '***configurada***' ? '' : c.apiKey || '';
    document.getElementById('mapsStatus').innerHTML = c.configurada ? '<div class="alert alert-success">✅ API Key configurada</div>' : '<div class="alert alert-error">❌ API Key não configurada (usando modo offline)</div>';
}
async function salvarApiKeyMaps() {
    const key = document.getElementById('googleMapsKey').value;
    await api('/api/maps/config','PUT',{apiKey:key});
    alert('API Key salva!');
    carregarMapConfig();
}
async function testarApiMaps() {
    const r = await api('/api/maps/geocodificar','POST',{endereco:'Osasco, SP'});
    if (r.sucesso && !r.offline) {
        document.getElementById('mapsStatus').innerHTML = '<div class="alert alert-success">✅ API funcionando! Geocodificou: '+r.endereco+'</div>';
    } else if (r.sucesso && r.offline) {
        document.getElementById('mapsStatus').innerHTML = '<div class="alert alert-error">⚠️ Modo offline ativo. Configure uma API Key válida.</div>';
    } else {
        document.getElementById('mapsStatus').innerHTML = '<div class="alert alert-error">❌ Erro: '+r.error+'</div>';
    }
}

// CONFIG
async function carregarConfig() {
    const c = await api('/api/config');
    document.getElementById('cfgTempoEspera').value = c.tempoMaximoEspera||10;
    document.getElementById('cfgTempoAceite').value = c.tempoMaximoAceite||5;
    document.getElementById('cfgRaioBusca').value = c.raioMaximoBusca||15;
    document.getElementById('cfgComissao').value = c.comissaoEmpresa||15;
    document.getElementById('cfgAvaliacaoMin').value = c.avaliacaoMinima||3;
}
async function salvarConfiguracoes() { await api('/api/config','PUT',{tempoMaximoEspera:parseInt(document.getElementById('cfgTempoEspera').value),tempoMaximoAceite:parseInt(document.getElementById('cfgTempoAceite').value),raioMaximoBusca:parseInt(document.getElementById('cfgRaioBusca').value),comissaoEmpresa:parseInt(document.getElementById('cfgComissao').value),avaliacaoMinima:parseFloat(document.getElementById('cfgAvaliacaoMin').value)}); alert('Salvo!'); }

// LOGS
async function carregarLogs() {
    const st = await api('/api/logs/estatisticas');
    document.getElementById('logTotal').textContent = st.total||0;
    document.getElementById('logHoje').textContent = st.hoje||0;
    document.getElementById('logErros').textContent = st.porTipo?.erro||0;
    const f = document.getElementById('filtroLogTipo').value;
    const l = await api('/api/logs?limite=50'+(f?'&tipo='+f:''));
    document.getElementById('logsLista').innerHTML = l.length ? l.map(x=>`<div class="log-item ${x.tipo}"><span style="color:#999;font-size:0.85em;">${new Date(x.dataHora).toLocaleString('pt-BR')}</span> <strong>${x.acao}</strong> <span style="color:#3498db;">- ${x.usuarioNome}</span></div>`).join('') : '<p style="color:#999">Nenhum</p>';
}

// HELPERS
function getStatusColor(s) { return {disponivel:'green',online:'green',finalizada:'green',resolvida:'green',em_corrida:'blue',em_andamento:'blue',aceita:'blue',pendente:'yellow',a_caminho:'yellow',media:'yellow',offline:'red',cancelada:'red',bloqueado:'red',alta:'red'}[s]||'blue'; }
function formatStatus(s) { return {disponivel:'Disponível',em_corrida:'Em Corrida',offline:'Offline',pendente:'Pendente',aceita:'Aceita',em_andamento:'Em Andamento',finalizada:'Finalizada',cancelada:'Cancelada',resolvida:'Resolvida'}[s]||s; }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); if(id==='modalMotorista'){document.getElementById('formMotorista').style.display='block';document.getElementById('tokenMotoristaBox').style.display='none';} if(id==='modalUsuario'){document.getElementById('formUsuario').style.display='block';document.getElementById('usuarioCriado').style.display='none';} }
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',(e)=>{if(e.target===m)fecharModal(m.id);}));

carregarDashboard();
setInterval(carregarDashboard, 30000);
