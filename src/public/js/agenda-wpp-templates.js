// agenda-wpp-templates.js - SOMENTE Rebeca Agenda
function limparTel(t) {
  t = (t||"").replace(/\D/g,"");
  if(t.length===11 && !t.startsWith("55")) t="55"+t;
  if(t.length===10 && !t.startsWith("55")) t="55"+t;
  return t;
}
function fmtData(d) {
  try { return new Date(d+"T12:00:00").toLocaleDateString("pt-BR"); } catch(_){ return d||""; }
}
var _tpl = {
  appointment_created: function(a) {
    return "Ola, "+a.nomeCliente+"! Seu agendamento na "+a.nomeNegocio+" foi confirmado para "+fmtData(a.data)+" as "+a.hora+". Servico: "+a.servico+(a.profissional?". Profissional: "+a.profissional:"")+(a.endereco?". Endereco: "+a.endereco:"")+". Qualquer duvida, fale por aqui.";
  },
  appointment_reminder: function(a) {
    return "Ola, "+a.nomeCliente+"! Seu horario na "+a.nomeNegocio+" e "+(a.data?"dia "+fmtData(a.data)+" ":"")+"as "+a.hora+". Servico: "+a.servico+". Te esperamos!";
  },
  appointment_rescheduled: function(a) {
    return "Ola, "+a.nomeCliente+"! Seu agendamento foi remarcado para "+fmtData(a.data)+" as "+a.hora+". Servico: "+a.servico+".";
  },
  appointment_cancelled: function(a) {
    return "Ola, "+a.nomeCliente+". Seu agendamento de "+fmtData(a.data)+" as "+a.hora+" foi cancelado."+(a.linkAgenda?" Para remarcar: "+a.linkAgenda:"");
  },
  review_request: function(a) {
    return "Ola, "+a.nomeCliente+"! Obrigado por escolher "+a.nomeNegocio+". Poderia avaliar seu atendimento?"+(a.linkAvaliacao?" "+a.linkAvaliacao:"");
  },
  client_to_business: function(a) {
    return "Ola! Vim pela agenda digital da "+a.nomeNegocio+" e gostaria de falar sobre um horario.";
  }
};
function buildWhatsappMessage(tipo, dados) {
  var fn = _tpl[tipo] || _tpl["appointment_created"];
  return fn(dados||{});
}
function buildWhatsappUrl(telefone, mensagem) {
  var tel = limparTel(telefone);
  if((tel||"").length < 12) return null;
  return "https://wa.me/"+tel+"?text="+encodeURIComponent(mensagem);
}
if(typeof module !== "undefined") module.exports = { buildWhatsappMessage, buildWhatsappUrl, limparTel };
