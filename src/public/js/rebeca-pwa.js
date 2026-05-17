/**
 * RebecaPWA — Install Prompt + Update Banner + Push Subscribe
 * Versão 1.0
 *
 * USO:
 *   RebecaPWA.init()                    — inicializar (chamado automaticamente)
 *   RebecaPWA.showInstallPrompt()       — forçar prompt de instalação
 *   RebecaPWA.subscribePush(vapidKey)   — assinar push notifications
 *   RebecaPWA.isInstalled()             — true se rodando como PWA
 */

window.RebecaPWA = (() => {

  let _deferredPrompt = null;
  let _installBanner  = null;
  let _updateBanner   = null;
  let _swReg          = null;

  // ── DETECTAR SE JÁ ESTÁ INSTALADO ─────────────────────────────────────────
  function _isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || document.referrer.includes('android-app://');
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('rpwa-css')) return;
    const s = document.createElement('style');
    s.id = 'rpwa-css';
    s.textContent = `
      /* ── INSTALL BANNER ── */
      #rpwa-install {
        position:fixed;bottom:0;left:0;right:0;
        background:#fff;
        border-top:1px solid #e2e8f0;
        padding:16px 20px;
        display:flex;align-items:center;gap:12px;
        z-index:99980;
        box-shadow:0 -8px 32px rgba(0,0,0,.1);
        animation:rpwa-up .4s cubic-bezier(.16,1,.3,1);
        transform:translateY(0);
      }
      @keyframes rpwa-up {
        from { transform:translateY(100%); opacity:0; }
        to   { transform:translateY(0);    opacity:1; }
      }
      #rpwa-install.rpwa-out {
        animation:rpwa-down .3s ease forwards;
      }
      @keyframes rpwa-down {
        to { transform:translateY(100%); opacity:0; }
      }
      #rpwa-install .ri-icon {
        width:48px;height:48px;border-radius:12px;
        flex-shrink:0;object-fit:cover;
        box-shadow:0 2px 8px rgba(0,0,0,.15);
      }
      #rpwa-install .ri-txt { flex:1;min-width:0; }
      #rpwa-install .ri-titulo {
        font-size:.85rem;font-weight:700;color:#0f172a;margin-bottom:2px;
      }
      #rpwa-install .ri-desc {
        font-size:.75rem;color:#64748b;
      }
      #rpwa-install .ri-btns {
        display:flex;flex-direction:column;gap:6px;flex-shrink:0;
      }
      #rpwa-install .ri-btn-install {
        padding:8px 16px;background:linear-gradient(135deg,#f97316,#fb923c);
        color:#fff;border:none;border-radius:8px;font-size:.78rem;
        font-weight:700;cursor:pointer;font-family:inherit;
        white-space:nowrap;
        box-shadow:0 3px 10px rgba(249,115,22,.3);
      }
      #rpwa-install .ri-btn-install:hover { background:#ea6c0a; }
      #rpwa-install .ri-btn-later {
        padding:4px 8px;background:none;border:none;
        color:#94a3b8;font-size:.72rem;cursor:pointer;
        font-family:inherit;text-align:center;
      }
      #rpwa-install .ri-btn-later:hover { color:#64748b; }

      /* ── UPDATE BANNER ── */
      #rpwa-update {
        position:fixed;top:0;left:0;right:0;
        background:#0f172a;color:#e2e8f0;
        padding:10px 16px;
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        z-index:99981;
        font-size:.8rem;
        animation:rpwa-down2 .3s ease;
      }
      @keyframes rpwa-down2 {
        from { transform:translateY(-100%); }
        to   { transform:translateY(0); }
      }
      #rpwa-update .ru-txt { flex:1; }
      #rpwa-update .ru-txt strong { color:#f97316; }
      #rpwa-update .ru-btn {
        padding:6px 14px;background:#f97316;color:#fff;
        border:none;border-radius:7px;font-size:.76rem;font-weight:700;
        cursor:pointer;font-family:inherit;white-space:nowrap;
      }
      #rpwa-update .ru-close {
        background:none;border:none;color:#64748b;
        cursor:pointer;font-size:16px;padding:2px;
      }

      /* ── BADGE INSTALADO ── */
      #rpwa-installed-badge {
        position:fixed;bottom:16px;left:16px;
        background:#22c55e;color:#fff;
        font-size:.72rem;font-weight:700;
        padding:5px 10px;border-radius:20px;
        z-index:99979;
        animation:rpwa-fadein .5s ease;
        pointer-events:none;
      }
      @keyframes rpwa-fadein {
        from{opacity:0;transform:translateY(8px)}
        to{opacity:1;transform:translateY(0)}
      }

      @media(max-width:480px) {
        #rpwa-install { padding:14px 16px; }
        #rpwa-install .ri-icon { width:40px;height:40px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── INSTALL BANNER ─────────────────────────────────────────────────────────
  function _showInstallBanner() {
    if (_installBanner) return;
    _injectCSS();

    // Detectar ícone e nome do produto
    const isAgenda = document.title.includes('Agenda');
    const icon = isAgenda ? '/agenda-icon-192.png' : '/icon-rebeca-192.png';
    const nome = isAgenda ? 'Rebeca Agenda' : 'Rebeca Admin';
    const desc = isAgenda ? 'Gerencie sua agenda direto da tela inicial'
                           : 'Pedidos e caixa na palma da mão';

    _installBanner = document.createElement('div');
    _installBanner.id = 'rpwa-install';
    _installBanner.innerHTML = `
      <img class="ri-icon" src="${icon}" alt="${nome}" onerror="this.style.display='none'">
      <div class="ri-txt">
        <div class="ri-titulo">Instalar ${nome}</div>
        <div class="ri-desc">${desc}</div>
      </div>
      <div class="ri-btns">
        <button class="ri-btn-install" onclick="RebecaPWA.install()">⬇ Instalar</button>
        <button class="ri-btn-later" onclick="RebecaPWA.dismissInstall()">Agora não</button>
      </div>`;

    document.body.appendChild(_installBanner);
  }

  function _dismissInstall(permanent) {
    if (!_installBanner) return;
    _installBanner.classList.add('rpwa-out');
    setTimeout(() => {
      _installBanner?.remove();
      _installBanner = null;
    }, 320);
    if (permanent) {
      localStorage.setItem('pwa-install-dismissed', Date.now());
    }
  }

  // ── UPDATE BANNER ──────────────────────────────────────────────────────────
  function _showUpdateBanner(reg) {
    if (_updateBanner) return;
    _injectCSS();

    _updateBanner = document.createElement('div');
    _updateBanner.id = 'rpwa-update';
    _updateBanner.innerHTML = `
      <div class="ru-txt">
        <strong>✨ Atualização disponível</strong> — recarregue para usar a versão mais recente
      </div>
      <button class="ru-btn" onclick="RebecaPWA.applyUpdate()">Atualizar</button>
      <button class="ru-close" onclick="this.parentElement.remove()">✕</button>`;

    document.body.prepend(_updateBanner);
  }

  // ── PUSH SUBSCRIBE ─────────────────────────────────────────────────────────
  async function _subscribePush(vapidPublicKey) {
    if (!_swReg || !vapidPublicKey) return null;
    try {
      const existing = await _swReg.pushManager.getSubscription();
      if (existing) return existing;

      const sub = await _swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidPublicKey),
      });
      console.log('[RebecaPWA] Push subscrito:', sub.endpoint);
      return sub;
    } catch(e) {
      console.warn('[RebecaPWA] Push falhou:', e.message);
      return null;
    }
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // ── INIT ───────────────────────────────────────────────────────────────────
  function _init() {
    // Registrar SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-rebeca.js')
        .then(reg => {
          _swReg = reg;
          console.log('[RebecaPWA] SW registrado:', reg.scope);

          // Detectar atualização disponível
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            newSW?.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                _showUpdateBanner(reg);
              }
            });
          });

          // Checar update imediato
          reg.update().catch(() => {});
        })
        .catch(e => console.warn('[RebecaPWA] SW falhou:', e));

      // Escutar mensagens do SW
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'NOTIF_CLICK') {
          const { action, data } = e.data;
          if (action === 'ver' && window.mostrarTela) {
            window.mostrarTela(data?.tipo === 'agendamento' ? 'agenda' : 'pedidos');
          }
          if (window.RebecaNotify) {
            RebecaNotify.info(`Notificação clicada: ${action}`);
          }
        }
        if (e.data?.type === 'SYNC_PEDIDOS' && window.carregarPedidos) {
          window.carregarPedidos();
        }
        if (e.data?.type === 'SYNC_AGENDAMENTOS' && window.carregarAgendamentos) {
          window.carregarAgendamentos();
        }
        if (e.data?.type === 'SW_VERSION') {
          console.log('[RebecaPWA] SW version:', e.data.version);
        }
      });
    }

    // Capturar install prompt
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredPrompt = e;

      // Não mostrar se já dispensou nos últimos 7 dias
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 3600 * 1000) return;

      // Não mostrar se já está instalado
      if (_isInstalled()) return;

      // Mostrar após 3s para não irritar
      setTimeout(_showInstallBanner, 3000);
    });

    // Detectar instalação concluída
    window.addEventListener('appinstalled', () => {
      _dismissInstall(false);
      _deferredPrompt = null;
      localStorage.setItem('pwa-instalado', '1');
      // Badge de confirmação
      _injectCSS();
      const badge = document.createElement('div');
      badge.id = 'rpwa-installed-badge';
      badge.textContent = '✅ App instalado!';
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 3000);
      // Notificar via RebecaNotify se disponível
      window.RebecaNotify?.sucesso('App instalado na tela inicial!', '✅ Instalado');
    });

    // Se já está instalado como PWA, mostrar badge discreto
    if (_isInstalled()) {
      console.log('[RebecaPWA] Rodando como PWA instalado');
    }
  }

  // API pública
  return {
    init: _init,

    install() {
      if (!_deferredPrompt) {
        // iOS — instrução manual
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          window.RebecaNotify?.info(
            'Toque em Compartilhar → "Adicionar à Tela de Início"',
            '📱 Instalar no iOS'
          );
        }
        return;
      }
      _deferredPrompt.prompt();
      _deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          console.log('[RebecaPWA] Usuário aceitou instalação');
        }
        _deferredPrompt = null;
        _dismissInstall(false);
      });
    },

    dismissInstall() { _dismissInstall(true); },

    applyUpdate() {
      if (_swReg?.waiting) {
        _swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      location.reload();
    },

    subscribePush: _subscribePush,

    isInstalled: _isInstalled,

    requestPushPermission() {
      return Notification.requestPermission().then(perm => {
        console.log('[RebecaPWA] Push permission:', perm);
        if (perm === 'granted') {
          window.RebecaNotify?.sucesso('Notificações ativadas!');
        }
        return perm;
      });
    },

    // Enfileirar pedido offline para sync posterior
    queueOffline(tipo, dados) {
      try {
        const fila = JSON.parse(localStorage.getItem('rebeca-offline-queue') || '[]');
        fila.push({ tipo, dados, ts: Date.now() });
        localStorage.setItem('rebeca-offline-queue', JSON.stringify(fila));
        // Registrar sync quando voltar online
        _swReg?.sync?.register(`sync-${tipo}`).catch(() => {});
      } catch(e) {}
    },

    // Ver fila offline
    offlineQueue() {
      return JSON.parse(localStorage.getItem('rebeca-offline-queue') || '[]');
    },
  };
})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RebecaPWA.init());
} else {
  RebecaPWA.init();
}

console.log('✅ RebecaPWA carregado');
console.log('   → RebecaPWA.install()              — instalar app');
console.log('   → RebecaPWA.requestPushPermission() — ativar notificações');
console.log('   → RebecaPWA.isInstalled()           — verificar se é PWA');
