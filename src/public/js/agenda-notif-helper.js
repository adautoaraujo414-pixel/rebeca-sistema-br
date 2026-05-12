// agenda-notif-helper.js - SOMENTE Rebeca Agenda
var AgendaNotif = (function() {
  var SW_URL = "/agenda-sw.js";
  var VAPID_URL = "/api/agenda-push/vapid-public";
  function urlB64(base64String) {
    var pad = "=".repeat((4-base64String.length%4)%4);
    var b64 = (base64String+pad).replace(/-/g,"+").replace(/_/g,"/");
    var raw = atob(b64); var arr = new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
    return arr;
  }
  async function registrarSW() {
    if(!("serviceWorker" in navigator)) return null;
    try {
      var reg = await navigator.serviceWorker.register(SW_URL, {scope:"/"});
      await navigator.serviceWorker.ready;
      return reg;
    } catch(e) { console.error("[AgendaNotif] SW:", e); return null; }
  }
  async function pedirPermissao() {
    if(!("Notification" in window)) return "unsupported";
    if(Notification.permission === "granted") return "granted";
    if(Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  }
  async function _getVapid() {
    try { var r=await fetch(VAPID_URL); var d=await r.json(); return d.publicKey||null; } catch(_){ return null; }
  }
  async function _criarSub(reg) {
    var vk = await _getVapid();
    if(!vk) return null;
    try {
      var sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64(vk)});
      return sub.toJSON();
    } catch(e) { console.error("[AgendaNotif] Sub:", e); return null; }
  }
  async function ativarAdmin(token) {
    var perm = await pedirPermissao();
    if(perm !== "granted") return {ok:false, motivo:perm};
    var reg = await registrarSW();
    if(!reg) return {ok:false, motivo:"sw_falhou"};
    var sub = await _criarSub(reg);
    if(!sub) return {ok:false, motivo:"sub_falhou"};
    try {
      var r = await fetch("/api/agenda-push/subscribe/admin",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(sub)});
      var d = await r.json();
      return {ok:!!d.sucesso};
    } catch(e) { return {ok:false, motivo:"api_erro"}; }
  }
  async function ativarCliente(adminId, telefone) {
    var perm = await pedirPermissao();
    if(perm !== "granted") return {ok:false, motivo:perm};
    var reg = await registrarSW();
    if(!reg) return {ok:false, motivo:"sw_falhou"};
    var sub = await _criarSub(reg);
    if(!sub) return {ok:false, motivo:"sub_falhou"};
    try {
      var r = await fetch("/api/agenda-push/subscribe/cliente/"+adminId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({},sub,{telefone:telefone||""}))});
      var d = await r.json();
      return {ok:!!d.sucesso};
    } catch(e) { return {ok:false, motivo:"api_erro"}; }
  }
  function notifLocal(titulo, corpo, url) {
    if(!("Notification" in window)||Notification.permission!=="granted") return;
    var n = new Notification(titulo, {body:corpo, icon:"/agenda-icon.svg"});
    n.onclick = function(){ if(url) window.open(url,"_blank"); n.close(); };
    setTimeout(function(){ n.close(); }, 8000);
  }
  return {
    registrarSW:registrarSW, pedirPermissao:pedirPermissao,
    ativarAdmin:ativarAdmin, ativarCliente:ativarCliente, notifLocal:notifLocal,
    suportado:function(){ return "Notification" in window && "serviceWorker" in navigator; },
    permissaoAtual:function(){ return "Notification" in window ? Notification.permission : "unsupported"; }
  };
})();
if(typeof module !== "undefined") module.exports = AgendaNotif;
