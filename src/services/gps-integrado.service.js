const { Motorista } = require('../models');

const gpsIntegradoService = {
    listarTodos: async (adminId) => {
        const filtro = adminId ? { adminId, ativo: true } : { ativo: true };
        const motoristas = await Motorista.find(filtro).lean();
        return motoristas.map(m => ({
            id: m._id.toString(),
            nome: m.nomeCompleto || m.nome || 'Motorista',
            telefone: m.telefone || m.whatsapp,
            veiculo: m.veiculo ? (m.veiculo.modelo || '') + ' ' + (m.veiculo.cor || '') + ' - ' + (m.veiculo.placa || '') : '-',
            latitude: m.latitude || (m.localizacao ? m.localizacao.latitude : null),
            longitude: m.longitude || (m.localizacao ? m.localizacao.longitude : null),
            status: m.status || 'offline',
            ultimaAtualizacao: m.updatedAt
        }));
    },
    listarPorStatus: async (adminId, statusFiltro) => {
        const todos = await gpsIntegradoService.listarTodos(adminId);
        return todos.filter(m => m.status === statusFiltro);
    },
    listarDisponiveis: async (adminId, latitude, longitude) => {
        let disponiveis = await gpsIntegradoService.listarPorStatus(adminId, 'disponivel');
        if (latitude && longitude) {
            disponiveis = disponiveis.map(m => {
                const dist = (m.latitude && m.longitude) ? calcularDistancia(latitude, longitude, m.latitude, m.longitude) : 999999;
                return Object.assign({}, m, { distancia: dist });
            });
            disponiveis.sort((a, b) => a.distancia - b.distancia);
        }
        return disponiveis;
    },
    buscarMaisProximo: async (adminId, latitude, longitude, raioKm) => {
        const disponiveis = await gpsIntegradoService.listarDisponiveis(adminId, latitude, longitude);
        if (disponiveis.length === 0) return null;
        const maisProximo = disponiveis[0];
        if (maisProximo.distancia > (raioKm || 10)) return null;
        return maisProximo;
    },
    atualizar: async (motoristaId, dados) => {
        const update = {};
        if (dados.latitude && dados.longitude) {
            update.latitude = dados.latitude;
            update.longitude = dados.longitude;
        }
        if (dados.status) update.status = dados.status;
        const motorista = await Motorista.findByIdAndUpdate(motoristaId, update, { new: true });
        return { id: motorista._id.toString(), nome: motorista.nomeCompleto || motorista.nome, status: motorista.status };
    },
    obterMotorista: async (motoristaId) => {
        const m = await Motorista.findById(motoristaId).lean();
        if (!m) return null;
        return {
            id: m._id.toString(),
            nome: m.nomeCompleto || m.nome || 'Motorista',
            telefone: m.telefone || m.whatsapp,
            veiculo: m.veiculo ? (m.veiculo.modelo || '') + ' ' + (m.veiculo.cor || '') + ' - ' + (m.veiculo.placa || '') : '-',
            latitude: m.latitude || (m.localizacao ? m.localizacao.latitude : null),
            longitude: m.longitude || (m.localizacao ? m.localizacao.longitude : null),
            status: m.status || 'offline'
        };
    },
    obterEstatisticas: async (adminId) => {
        const filtro = adminId ? { adminId, ativo: true } : { ativo: true };
        const motoristas = await Motorista.find(filtro).lean();
        return {
            disponiveis: motoristas.filter(m => m.status === 'disponivel').length,
            emCorrida: motoristas.filter(m => m.status === 'em_corrida').length,
            offline: motoristas.filter(m => m.status === 'offline' || !m.status).length,
            totalMotoristas: motoristas.length
        };
    }
};

function calcularDistancia(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


// ==================== NOTIFICAR MOTORISTA DE NOVA CORRIDA ====================
gpsIntegradoService.notificarMotorista = async (motorista, corrida) => {
    try {
        const { InstanciaWhatsapp } = require("../models");
        const EvolutionMultiService = require("./evolution-multi.service");
        const adminId = corrida.adminId || motorista.adminId;
        const telefone = motorista.whatsapp || motorista.telefone;
        if (!telefone) return false;
        const inst = await InstanciaWhatsapp.findOne({ adminId, status: { $in: ["conectado","open","connected"] } });
        if (!inst) { console.log("[NOTIF-MOT] Sem instancia:", adminId); return false; }
        const origem  = corrida.enderecoOrigemTexto  || corrida.origem?.endereco  || "Nao informado";
        const destino = corrida.enderecoDestinoTexto || corrida.destino?.endereco || "Nao informado";
        const preco   = corrida.precoEstimado ? "R$ " + Number(corrida.precoEstimado).toFixed(2).replace(".", ",") : "A combinar";
        const dist    = corrida.distanciaKm ? corrida.distanciaKm + " km" : "";
        const obsOri  = corrida.observacaoOrigem  ? "\n Obs origem: "  + corrida.observacaoOrigem  : "";
        const obsDes  = corrida.observacaoDestino ? "\n Obs destino: " + corrida.observacaoDestino : "";
        const obsGeral = (corrida.obsMotorista || corrida.observacao) ? "\n Obs: " + (corrida.obsMotorista || corrida.observacao) : "";
        const msg = "\uD83D\uDEA8 *NOVA CORRIDA!*\n\n" +
            "\uD83D\uDC64 *Cliente:* " + (corrida.clienteNome || "Cliente") + "\n" +
            "\uD83D\uDCCD *Origem:* " + origem + obsOri + "\n" +
            "\uD83C\uDFC1 *Destino:* " + destino + obsDes + "\n" +
            (dist ? "\uD83D\uDCCF *Distancia:* " + dist + "\n" : "") +
            "\uD83D\uDCB0 *Valor:* " + preco + obsGeral + "\n\n" +
            "Responda *ACEITAR* para aceitar ou ignore para recusar.";
        if (corrida.clienteFoto) {
            try {
                await EvolutionMultiService.enviarImagem(inst._id, telefone, corrida.clienteFoto, "Cliente: " + (corrida.clienteNome || ""));
                console.log("[NOTIF-MOT] Foto enviada ao motorista:", telefone);
            } catch(fe) { console.log("[NOTIF-MOT] Foto nao enviada:", fe.message); }
        }
        await EvolutionMultiService.enviarMensagem(inst._id, telefone, msg);
        console.log("[NOTIF-MOT] Motorista notificado:", telefone);
        return true;
    } catch(e) { console.error("[NOTIF-MOT] Erro:", e.message); return false; }
};
module.exports = gpsIntegradoService;