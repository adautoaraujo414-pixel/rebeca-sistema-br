// ========== WHATSAPP EVOLUTION API - PAINEL ADMIN ==========

let whatsappStatusInterval = null;

async function carregarWhatsAppEvolution() {
    await carregarConfigWhatsApp();
    await verificarStatusWhatsApp();
    
    // Verificar status a cada 10 segundos
    if (whatsappStatusInterval) clearInterval(whatsappStatusInterval);
    whatsappStatusInterval = setInterval(verificarStatusWhatsApp, 10000);
}

async function carregarConfigWhatsApp() {
    try {
        const res = await fetch('/api/whatsapp-evolution/config');
        const config = await res.json();
        
        document.getElementById('evoServerUrl').value = config.serverUrl || '';
        document.getElementById('evoApiKey').value = config.apiKey === '***configurado***' ? '' : (config.apiKey || '');
        document.getElementById('evoInstance').value = config.instanceName || 'ubmax';
        
        if (config.apiKey === '***configurado***') {
            document.getElementById('evoApiKey').placeholder = '***já configurado***';
        }
    } catch (e) {
        console.error('Erro ao carregar config:', e);
    }
}

async function salvarConfigWhatsApp() {
    const serverUrl = document.getElementById('evoServerUrl').value.trim();
    const apiKey = document.getElementById('evoApiKey').value.trim();
    const instanceName = document.getElementById('evoInstance').value.trim();
    
    if (!serverUrl) {
        alert('Informe a URL do servidor Evolution API');
        return;
    }
    
    try {
        const body = { serverUrl, instanceName };
        if (apiKey) body.apiKey = apiKey;
        
        const res = await fetch('/api/whatsapp-evolution/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.sucesso) {
            alert('✅ Configurações salvas!');
        } else {
            alert('❌ Erro: ' + (data.erro || 'Falha ao salvar'));
        }
    } catch (e) {
        alert('❌ Erro de conexão');
    }
}

async function criarInstanciaWhatsApp() {
    try {
        document.getElementById('btnCriarInstancia').disabled = true;
        document.getElementById('btnCriarInstancia').textContent = '⏳ Criando...';
        
        const res = await fetch('/api/whatsapp-evolution/criar-instancia', { method: 'POST' });
        const data = await res.json();
        
        if (data.error) {
            alert('❌ Erro: ' + data.error);
        } else {
            alert('✅ Instância criada! Agora clique em "Conectar" para gerar o QR Code.');
        }
    } catch (e) {
        alert('❌ Erro ao criar instância');
    } finally {
        document.getElementById('btnCriarInstancia').disabled = false;
        document.getElementById('btnCriarInstancia').textContent = '➕ Criar Instância';
    }
}

async function conectarWhatsApp() {
    try {
        document.getElementById('qrCodeContainer').innerHTML = '<p>⏳ Gerando QR Code...</p>';
        
        const res = await fetch('/api/whatsapp-evolution/conectar');
        const data = await res.json();
        
        if (data.base64) {
            document.getElementById('qrCodeContainer').innerHTML = `
                <img src="${data.base64}" alt="QR Code" style="max-width:300px;border-radius:10px;">
                <p style="margin-top:10px;color:#00ff88;">📱 Escaneie com seu WhatsApp!</p>
            `;
        } else if (data.instance?.state === 'open') {
            document.getElementById('qrCodeContainer').innerHTML = `
                <p style="color:#00ff88;font-size:1.2em;">✅ WhatsApp já conectado!</p>
            `;
        } else {
            document.getElementById('qrCodeContainer').innerHTML = `
                <p style="color:#ff6b6b;">❌ ${data.error || 'Erro ao gerar QR Code'}</p>
                <p style="color:#888;font-size:0.9em;">Verifique as configurações e tente novamente.</p>
            `;
        }
    } catch (e) {
        document.getElementById('qrCodeContainer').innerHTML = '<p style="color:#ff6b6b;">❌ Erro de conexão</p>';
    }
}

async function verificarStatusWhatsApp() {
    try {
        const res = await fetch('/api/whatsapp-evolution/status');
        const data = await res.json();
        
        const statusEl = document.getElementById('whatsappStatus');
        const state = data.instance?.state || data.state || 'disconnected';
        
        if (state === 'open' || state === 'connected') {
            statusEl.innerHTML = '<span class="badge green">✅ Conectado</span>';
            document.getElementById('qrCodeContainer').innerHTML = '<p style="color:#00ff88;">✅ WhatsApp conectado e funcionando!</p>';
        } else if (state === 'connecting') {
            statusEl.innerHTML = '<span class="badge yellow">⏳ Conectando...</span>';
        } else {
            statusEl.innerHTML = '<span class="badge red">❌ Desconectado</span>';
        }
    } catch (e) {
        document.getElementById('whatsappStatus').innerHTML = '<span class="badge red">⚠️ Erro</span>';
    }
}

async function desconectarWhatsApp() {
    if (!confirm('Deseja desconectar o WhatsApp?')) return;
    
    try {
        await fetch('/api/whatsapp-evolution/desconectar', { method: 'POST' });
        alert('✅ WhatsApp desconectado');
        verificarStatusWhatsApp();
    } catch (e) {
        alert('❌ Erro ao desconectar');
    }
}

async function testarEnvioWhatsApp() {
    const telefone = document.getElementById('testeTelefone').value.trim();
    const mensagem = document.getElementById('testeMensagem').value.trim();
    
    if (!telefone) {
        alert('Informe o número de telefone');
        return;
    }
    
    try {
        document.getElementById('btnTesteEnvio').disabled = true;
        document.getElementById('btnTesteEnvio').textContent = '⏳ Enviando...';
        
        const res = await fetch('/api/whatsapp-evolution/teste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, mensagem })
        });
        const data = await res.json();
        
        if (data.sucesso) {
            alert('✅ Mensagem enviada com sucesso!');
        } else {
            alert('❌ Erro: ' + (data.erro || 'Falha ao enviar'));
        }
    } catch (e) {
        alert('❌ Erro de conexão');
    } finally {
        document.getElementById('btnTesteEnvio').disabled = false;
        document.getElementById('btnTesteEnvio').textContent = '📤 Enviar Teste';
    }
}

// ========== INJETAR MENU E PÁGINA ==========
document.addEventListener('DOMContentLoaded', () => {
    // Adicionar menu
    const menuWhatsApp = document.querySelector('[data-page="whatsapp"]');
    if (menuWhatsApp) {
        const menuEvolution = document.createElement('div');
        menuEvolution.className = 'menu-item';
        menuEvolution.setAttribute('data-page', 'whatsapp-evolution');
        menuEvolution.innerHTML = '📱 WhatsApp API';
        menuEvolution.onclick = () => {
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            menuEvolution.classList.add('active');
            document.getElementById('whatsapp-evolution').classList.add('active');
            carregarWhatsAppEvolution();
        };
        menuWhatsApp.insertAdjacentElement('afterend', menuEvolution);
    }

    // Criar página
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        const pageEvolution = document.createElement('div');
        pageEvolution.id = 'whatsapp-evolution';
        pageEvolution.className = 'page';
        pageEvolution.innerHTML = `
            <h2 style="margin-bottom:20px;">📱 WhatsApp Evolution API</h2>
            <p style="color:#888;margin-bottom:20px;">Conecte o WhatsApp da empresa para Rebeca enviar mensagens automáticas.</p>
            
            <div class="panel-grid">
                <!-- Status -->
                <div class="panel">
                    <h3>📊 Status da Conexão</h3>
                    <div style="text-align:center;padding:20px;">
                        <div id="whatsappStatus" style="font-size:1.5em;margin-bottom:15px;">
                            <span class="badge yellow">⏳ Verificando...</span>
                        </div>
                        <div id="qrCodeContainer" style="margin:20px 0;min-height:100px;">
                            <p style="color:#888;">Clique em "Conectar" para gerar QR Code</p>
                        </div>
                        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                            <button class="btn btn-primary" onclick="conectarWhatsApp()">🔗 Conectar</button>
                            <button class="btn btn-danger" onclick="desconectarWhatsApp()">🔌 Desconectar</button>
                        </div>
                    </div>
                </div>

                <!-- Configurações -->
                <div class="panel">
                    <h3>⚙️ Configurações</h3>
                    <div style="display:grid;gap:15px;">
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">URL do Servidor Evolution</label>
                            <input type="text" id="evoServerUrl" class="form-control" placeholder="https://seu-servidor.com">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">API Key</label>
                            <input type="password" id="evoApiKey" class="form-control" placeholder="Sua chave de API">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;color:#666;">Nome da Instância</label>
                            <input type="text" id="evoInstance" class="form-control" value="ubmax">
                        </div>
                        <button class="btn btn-success" onclick="salvarConfigWhatsApp()" style="width:100%;">💾 Salvar Configurações</button>
                        <button class="btn btn-primary" id="btnCriarInstancia" onclick="criarInstanciaWhatsApp()" style="width:100%;">➕ Criar Instância</button>
                    </div>
                </div>
            </div>

            <!-- Teste -->
            <div class="panel" style="margin-top:20px;">
                <h3>🧪 Teste de Envio</h3>
                <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:15px;align-items:end;">
                    <div>
                        <label style="display:block;margin-bottom:5px;color:#666;">Telefone</label>
                        <input type="text" id="testeTelefone" class="form-control" placeholder="11999999999">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;color:#666;">Mensagem</label>
                        <input type="text" id="testeMensagem" class="form-control" value="🚗 Teste UBMAX Rebeca funcionando!">
                    </div>
                    <button class="btn btn-primary" id="btnTesteEnvio" onclick="testarEnvioWhatsApp()">📤 Enviar Teste</button>
                </div>
            </div>

            <!-- Instruções -->
            <div class="panel" style="margin-top:20px;">
                <h3>📖 Como Configurar</h3>
                <ol style="color:#888;line-height:2;">
                    <li>Crie uma instância do Evolution API (Render, VPS ou serviço hospedado)</li>
                    <li>Copie a URL do servidor e a API Key</li>
                    <li>Cole nas configurações acima e salve</li>
                    <li>Clique em "Criar Instância"</li>
                    <li>Clique em "Conectar" para gerar o QR Code</li>
                    <li>Escaneie o QR Code com o WhatsApp da empresa</li>
                    <li>Pronto! Rebeca agora envia mensagens reais 🎉</li>
                </ol>
            </div>
        `;
        mainContent.appendChild(pageEvolution);
    }
});
