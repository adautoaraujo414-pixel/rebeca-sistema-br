if (usuario.nome) { document.getElementById('userName').textContent = usuario.nome; document.getElementById('userRole').textContent = usuario.nivel || 'Admin'; }

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
    const fn = { dashboard:carregarDashboard, mapa:carregarMapa, corridas:carregarCorridas, despacho:carregarDespacho, motoristas:carregarMotoristas, clientes:carregarClientes, rotas:carregarRotas, faturamento:carregarFaturamento, precos:carregarPrecos, ranking:carregarRanking, antifraude:carregarAntiFraude, blacklist:carregarBlacklist, reclamacoes:carregarReclamacoes, whatsapp:carregarWhatsApp, usuarios:carregarUsuarios, areas:carregarAreas, config:carregarConfig, logs:carregarLogs };
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
    const mots = await api('/api/gps-integrado');
    // Auto-centralizar no primeiro motorista com GPS
    const motComGPS = mots.find(m => m.latitude && m.longitude);
    if (motComGPS && marcadores.length === 0) { mapaLeaflet.setView([motComGPS.latitude, motComGPS.longitude], 14); }
    mots.forEach(m => { if (m.latitude && m.longitude) { const cor = m.status==='disponivel'?'#27ae60':m.status==='em_corrida'?'#3498db':'#999'; const ic = L.divIcon({html:`<div style="background:${cor};width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;">🚗</div>`,className:'',iconSize:[30,30]}); marcadores.push(L.marker([m.latitude,m.longitude],{icon:ic}).addTo(mapaLeaflet).bindPopup(`<b>${m.nome}</b><br>${formatStatus(m.status)}`)); }});
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
    const corridas = await api('/api/corridas?status=pendente');
    document.getElementById('corridasPendentesDespacho').innerHTML = corridas.length ? corridas.map(c=>`<div class="corrida-despacho aguardando"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${c.clienteNome||'Cliente'}</strong><br><small>📍 ${(c.origem?.endereco||c.origem||'').toString().slice(0,30)}...</small></div><div><button class="btn btn-primary btn-sm" onclick="despacharCorrida('${c.id}')">📡 Despachar</button></div></div></div>`).join('') : '<p style="color:#999;text-align:center;">Nenhuma pendente</p>';
}
async function setModoDespacho(modo) { await api('/api/despacho/config', 'PUT', { modo }); carregarDespacho(); }
async function salvarTempoAceite() { const tempo = document.getElementById('tempoAceite').value; await api('/api/despacho/config', 'PUT', { tempoAceiteSegundos: parseInt(tempo) }); alert('✅ Salvo!'); }

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
document.getElementById('formMotorista').addEventListener('submit', async(e)=>{ e.preventDefault(); const d={nomeCompleto:document.getElementById('motNome').value.trim(),whatsapp:document.getElementById('motWhatsApp').value.trim(),cpf:document.getElementById('motCPF').value.trim(),cnh:document.getElementById('motCNH').value.trim(),cidadeAtuacao:document.getElementById('motCidade').value.trim(),cnhValidade:document.getElementById('motCNHValidade').value,veiculo:{modelo:document.getElementById('motVeiculoModelo').value.trim(),cor:document.getElementById('motVeiculoCor').value.trim(),placa:document.getElementById('motVeiculoPlaca').value.trim().toUpperCase(),ano:parseInt(document.getElementById('motVeiculoAno').value)||2020},plano:document.getElementById('motPlano').value,valorMensalidade:parseFloat(document.getElementById('motValorMensalidade').value)||100,enviarWhatsApp:document.getElementById('motEnviarWhatsApp').checked,senhaPin:document.getElementById('motSenhaPin').value.trim()}; if(!d.nomeCompleto||!d.whatsapp||!d.cnh||!d.veiculo.modelo||!d.veiculo.cor||!d.veiculo.placa){document.getElementById('formMotoristaAlert').innerHTML='<div class="alert alert-error">Preencha campos obrigatórios</div>';return;} if(!d.senhaPin||d.senhaPin.length!==6||!/^[0-9]{6}$/.test(d.senhaPin)){document.getElementById('formMotoristaAlert').innerHTML='<div class="alert alert-error">PIN deve ter exatamente 6 números</div>';return;} const r=await api('/api/motoristas','POST',d); if(r.error){document.getElementById('formMotoristaAlert').innerHTML=`<div class="alert alert-error">${r.error}</div>`;return;} document.getElementById('formMotoristaAlert').innerHTML=''; document.getElementById('formMotorista').style.display='none'; document.getElementById('tokenGerado').textContent=r.motorista.token; document.getElementById('senhaGerada').textContent=r.senhaGerada; document.getElementById('tokenMotoristaBox').style.display='block'; carregarMotoristas(); });
async function desativarMotorista(id) { if (confirm('Desativar?')) { await api('/api/motoristas/'+id,'DELETE'); carregarMotoristas(); }}

// CLIENTES
async function carregarClientes() { const b=document.getElementById('buscaCliente').value; const c=await api('/api/clientes'+(b?'?busca='+b:'')); document.getElementById('clientesTable').innerHTML=c.length?c.map(x=>`<tr><td>${x.nome}</td><td>📱 ${x.telefone}</td><td>${x.corridasRealizadas||0}</td><td><span class="badge ${x.bloqueado?'red':'green'}">${x.bloqueado?'Bloqueado':'Ativo'}</span></td><td>${x.bloqueado?`<button class="btn btn-success btn-sm" onclick="desbloquearCliente('${x.id}')">Desbloquear</button>`:`<button class="btn btn-danger btn-sm" onclick="bloquearCliente('${x.id}')">Bloquear</button>`}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhum</td></tr>'; }
function abrirModalCliente() { document.getElementById('formCliente').reset(); document.getElementById('modalCliente').classList.add('active'); }
document.getElementById('formCliente').addEventListener('submit',async(e)=>{ e.preventDefault(); await api('/api/clientes','POST',{nome:document.getElementById('cliNome').value,telefone:document.getElementById('cliTelefone').value}); fecharModal('modalCliente'); carregarClientes(); });
async function bloquearCliente(id) { if(confirm('Bloquear?')){ await api('/api/clientes/'+id+'/bloquear','PUT',{motivo:'Admin'}); carregarClientes(); }}
async function desbloquearCliente(id) { await api('/api/clientes/'+id+'/desbloquear','PUT'); carregarClientes(); }

// ROTAS
let mapaRotaLeaflet = null;
async function carregarRotas() { if (!mapaRotaLeaflet) { mapaRotaLeaflet = L.map('mapaGoogle').setView([-23.5327,-46.7917],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaRotaLeaflet); }}
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
async function carregarWhatsApp() { const c=await api('/api/config/whatsapp'); document.getElementById('whatsappApiUrl').value=c.apiUrl||''; document.getElementById('whatsappApiKey').value=c.apiKey||''; document.getElementById('whatsappInstancia').value=c.instancia||''; document.getElementById('whatsappStatus').innerHTML=c.conectado?'<p><span class="status-indicator online"></span> Conectado</p>':'<p><span class="status-indicator offline"></span> Desconectado</p>'; }
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
function getStatusColor(s) { return {disponivel:'green',online:'green',finalizada:'green',resolvida:'green',em_corrida:'blue',em_andamento:'blue',aceita:'blue',buscando_motorista:'blue',pendente:'yellow',a_caminho:'yellow',offline:'red',cancelada:'red',bloqueado:'red'}[s]||'blue'; }
function formatStatus(s) { return {disponivel:'Disponível',em_corrida:'Em Corrida',offline:'Offline',pendente:'Pendente',aceita:'Aceita',em_andamento:'Em Andamento',finalizada:'Finalizada',cancelada:'Cancelada',resolvida:'Resolvida',buscando_motorista:'Buscando'}[s]||s; }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); if(id==='modalMotorista'){document.getElementById('formMotorista').style.display='block';document.getElementById('tokenMotoristaBox').style.display='none';} if(id==='modalUsuario'){document.getElementById('formUsuario').style.display='block';document.getElementById('usuarioCriado').style.display='none';} }
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',(e)=>{if(e.target===m)fecharModal(m.id);}));

carregarDashboard();
setInterval(carregarDashboard, 30000);

// ==================== INTERMUNICIPAIS ====================
async function carregarIntermunicipais() { const p=await api('/api/precos-intermunicipais'); document.getElementById('intermunicipaisTable').innerHTML=p.length?p.map(x=>`<tr><td>${x.cidadeOrigem}</td><td>${x.cidadeDestino}</td><td>${x.distanciaKm||'-'} km</td><td>R$ ${(x.precoFixo||0).toFixed(2)}</td><td><button class="btn btn-danger btn-sm" onclick="excluirIntermunicipal('${x._id}')">🗑️</button></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma rota cadastrada</td></tr>'; }
function abrirModalIntermunicipal() { document.getElementById('formIntermunicipal').reset(); abrirModal('modalIntermunicipal'); }
document.getElementById('formIntermunicipal').addEventListener('submit', async(e)=>{ e.preventDefault(); const d={cidadeOrigem:document.getElementById('intOrigem').value,cidadeDestino:document.getElementById('intDestino').value,distanciaKm:parseFloat(document.getElementById('intDistancia').value)||null,precoFixo:parseFloat(document.getElementById('intPreco').value),tempoEstimadoMin:parseInt(document.getElementById('intTempo').value)||null}; await api('/api/precos-intermunicipais','POST',d); fecharModal('modalIntermunicipal'); carregarIntermunicipais(); });
async function excluirIntermunicipal(id) { if(confirm('Excluir rota?')) { await api('/api/precos-intermunicipais/'+id,'DELETE'); carregarIntermunicipais(); }}
