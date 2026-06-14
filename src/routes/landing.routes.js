'use strict';
const express = require('express');
const router  = express.Router();
const { Admin, Motorista, Mensalidade } = require('../models');
const MotoristaService = require('../services/motorista.service');
const axios = require('axios');

const NUMERO_APROVACAO = '5534984039955'; // número que recebe comprovante e aprova

// ── GET /api/landing/cidades ──────────────────────────────────────────
// Lista cidades/centrais ativas e visíveis na landing
router.get('/cidades', async (req, res) => {
    try {
        const admins = await Admin.find(
            { ativo: true, visibleLanding: true },
            'nome empresa cidade estado whatsappCentral telefone valorMensalidade valorSemanal chavePix tipoChavePix corPrimaria logoUrl nomeMarca'
        ).sort({ cidade: 1 }).lean();

        const cidades = admins.map(a => ({
            id: a._id,
            cidade: a.cidade || a.empresa || a.nome,
            estado: a.estado || '',
            central: a.whatsappCentral || a.telefone || '',
            nomeMarca: a.nomeMarca || a.empresa || a.nome,
            valorMensalidade: a.valorMensalidade || 100,
            valorSemanal: a.valorSemanal || 30,
            chavePix: a.chavePix || '',
            tipoChavePix: a.tipoChavePix || 'aleatoria',
            cor: a.corPrimaria || '#00e676',
            logo: a.logoUrl || '',
        }));

        res.json({ sucesso: true, cidades });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── POST /api/landing/motorista/pre-cadastro ──────────────────────────
// Motorista preenche o formulário na landing. Cria motorista (inativo) +
// mensalidade pendente, e retorna dados do PIX para pagamento.
router.post('/motorista/pre-cadastro', async (req, res) => {
    try {
        const {
            adminId, nomeCompleto, whatsapp, cnh, cnhValidade,
            modeloCarro, corCarro, anoCarro, placa, plano
        } = req.body;

        if (!adminId || !nomeCompleto || !whatsapp || !cnh) {
            return res.json({ sucesso: false, erro: 'Campos obrigatórios: cidade, nome, whatsapp, CNH.' });
        }

        const admin = await Admin.findById(adminId).lean();
        if (!admin) return res.json({ sucesso: false, erro: 'Central não encontrada.' });

        // Normalizar whatsapp
        let tel = (whatsapp || '').replace(/\D/g, '');
        if ((tel.length === 11 || tel.length === 10) && !tel.startsWith('55')) tel = '55' + tel;

        // Já existe e ativo nesta central?
        const existe = await Motorista.findOne({ whatsapp: tel, adminId });
        if (existe && existe.ativo) {
            return res.json({ sucesso: false, erro: 'Este WhatsApp já está cadastrado e ativo nesta central.' });
        }

        const planoEscolhido = plano === 'semanal' ? 'semanal' : 'mensal';
        const valor = planoEscolhido === 'semanal'
            ? (admin.valorSemanal || 30)
            : (admin.valorMensalidade || 100);

        const dadosMotorista = {
            nomeCompleto,
            whatsapp: tel,
            cnh,
            cnhValidade: cnhValidade || undefined,
            veiculo: { modelo: modeloCarro || '', cor: corCarro || '', ano: anoCarro ? Number(anoCarro) : undefined, placa: placa || '' },
            plano: planoEscolhido,
            valorMensalidade: valor,
            ativo: false,          // inativo até comprovante ser aprovado
            status: 'indisponivel',
            enviarWhatsApp: false, // não dispara msg de boas-vindas do fluxo normal aqui
        };

        let motorista;
        if (existe) {
            // Reaproveita cadastro existente (ex: tentou antes e não pagou)
            Object.assign(existe, dadosMotorista);
            await existe.save();
            motorista = existe;
        } else {
            motorista = await MotoristaService.criar(dadosMotorista, adminId);
            // MotoristaService força ativo:true — corrigir aqui
            motorista.ativo = false;
            motorista.status = 'indisponivel';
            await motorista.save();
        }

        // Mensalidade pendente vinculada
        const diasVencimento = planoEscolhido === 'semanal' ? 7 : 30;
        const dataVencimento = new Date();
        dataVencimento.setDate(dataVencimento.getDate() + diasVencimento);

        await Mensalidade.findOneAndUpdate(
            { motoristaId: motorista._id, status: 'pendente' },
            {
                $set: {
                    motoristaId: motorista._id,
                    motoristaNome: motorista.nomeCompleto,
                    motoristaWhatsapp: motorista.whatsapp,
                    plano: planoEscolhido,
                    valor,
                    dataVencimento,
                    status: 'pendente',
                }
            },
            { upsert: true, new: true }
        );

        res.json({
            sucesso: true,
            motoristaId: motorista._id,
            token: motorista.token,
            chavePix: admin.chavePix || '',
            tipoChavePix: admin.tipoChavePix || 'aleatoria',
            valor,
            plano: planoEscolhido,
            nomeMarca: admin.nomeMarca || admin.empresa || admin.nome,
            mensagem: `✅ Pré-cadastro realizado! Envie o comprovante de R$${valor} para liberar seu acesso.`
        });

    } catch (e) {
        console.error('[Landing] Erro pré-cadastro:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── POST /api/landing/motorista/comprovante ───────────────────────────
// Recebe a URL da foto do comprovante (já enviada/upada), encaminha para
// o número de aprovação via Meta API, ativa o motorista e marca a
// mensalidade pendente como pago, depois envia token + acesso ao motorista.
router.post('/motorista/comprovante', async (req, res) => {
    try {
        const { motoristaId, fotoUrl } = req.body;
        if (!motoristaId) return res.json({ sucesso: false, erro: 'motoristaId obrigatório' });

        const motorista = await Motorista.findById(motoristaId);
        if (!motorista) return res.json({ sucesso: false, erro: 'Motorista não encontrado' });

        const admin = await Admin.findById(motorista.adminId).lean();
        const nomeMarca = admin?.nomeMarca || admin?.empresa || admin?.nome || 'BecaMob';

        const mensalidade = await Mensalidade.findOne({ motoristaId: motorista._id, status: 'pendente' })
            .sort({ createdAt: -1 });
        const valor = mensalidade?.valor ?? motorista.valorMensalidade ?? 100;

        const TOKEN_META    = process.env.META_WA_TOKEN;
        const PHONE_ID_META = process.env.META_WA_PHONE_ID;

        // Encaminhar para o número de aprovação
        if (TOKEN_META && PHONE_ID_META) {
            const msgAprovacao =
                `🚗 *Novo comprovante de motorista!*\n\n` +
                `👤 Nome: ${motorista.nomeCompleto}\n` +
                `📱 WhatsApp: ${motorista.whatsapp}\n` +
                `🏙️ Central: ${nomeMarca} (${admin?.cidade || ''})\n` +
                `💰 Plano: ${motorista.plano} — R$${Number(valor).toFixed(2)}\n` +
                `🪪 CNH: ${motorista.cnh}\n` +
                `🚙 Veículo: ${motorista.veiculo?.modelo || ''} ${motorista.veiculo?.cor || ''} ${motorista.veiculo?.ano || ''} - ${motorista.veiculo?.placa || ''}\n\n` +
                `Token: ${motorista.token}\n` +
                `ID: ${motorista._id}`;

            try {
                await axios.post(
                    `https://graph.facebook.com/v20.0/${PHONE_ID_META}/messages`,
                    { messaging_product: 'whatsapp', to: NUMERO_APROVACAO, type: 'text', text: { body: msgAprovacao } },
                    { headers: { Authorization: `Bearer ${TOKEN_META}`, 'Content-Type': 'application/json' } }
                );

                if (fotoUrl) {
                    await axios.post(
                        `https://graph.facebook.com/v20.0/${PHONE_ID_META}/messages`,
                        { messaging_product: 'whatsapp', to: NUMERO_APROVACAO, type: 'image', image: { link: fotoUrl, caption: `Comprovante de ${motorista.nomeCompleto}` } },
                        { headers: { Authorization: `Bearer ${TOKEN_META}`, 'Content-Type': 'application/json' } }
                    );
                }
            } catch (e) {
                console.error('[Landing] Erro envio comprovante Meta:', e.response?.data?.error || e.message);
            }
        }

        // Ativar motorista automaticamente
        motorista.ativo = true;
        motorista.status = 'disponivel';
        await motorista.save();

        // Marcar mensalidade como pago, registrando o comprovante
        if (mensalidade) {
            mensalidade.status = 'pago';
            mensalidade.dataPagamento = new Date();
            if (fotoUrl) mensalidade.comprovante = fotoUrl;
            await mensalidade.save();
        }

        // Enviar token + acesso liberado ao motorista
        if (TOKEN_META && PHONE_ID_META) {
            const linkApp = 'https://rebeca-sistema-br.onrender.com/motorista-app.html';
            const msgMotorista =
                `🚗 *Bem-vindo à BecaMob!*\n\n` +
                `A plataforma de mobilidade urbana que conecta você às centrais de transporte da sua região. ✅\n\n` +
                `✅ Pagamento confirmado! Seu acesso está liberado.\n\n` +
                `🔑 *Seu Token:*\n${motorista.token}\n` +
                `🔒 *Sua Senha:*\n${motorista.senha}\n\n` +
                `🔗 *Acesse o app:*\n${linkApp}\n\n` +
                `📱 *Central de corridas (${nomeMarca}):*\n${admin?.whatsappCentral || admin?.telefone || 'em breve'}\n\n` +
                `🆘 *Suporte BecaMob* — erros, dúvidas e problemas no app:\n${NUMERO_APROVACAO.replace('55','')}\n\n` +
                `Você já pode receber corridas! Boas corridas e bons ganhos! 🚀`;

            try {
                await axios.post(
                    `https://graph.facebook.com/v20.0/${PHONE_ID_META}/messages`,
                    { messaging_product: 'whatsapp', to: motorista.whatsapp, type: 'text', text: { body: msgMotorista } },
                    { headers: { Authorization: `Bearer ${TOKEN_META}`, 'Content-Type': 'application/json' } }
                );
            } catch (e) {
                console.error('[Landing] Erro envio boas-vindas motorista:', e.response?.data?.error || e.message);
            }
        }

        res.json({
            sucesso: true,
            mensagem: '✅ Comprovante enviado! Seu token de acesso chegará no WhatsApp em instantes.',
            token: motorista.token,
        });

    } catch (e) {
        console.error('[Landing] Erro comprovante:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── GET /api/landing/rastrear/:token ─────────────────────────────────
// Cliente acompanha o motorista em tempo real pelo token da corrida
router.get('/rastrear/:token', async (req, res) => {
    try {
        const { Corrida } = require('../models');
        const corrida = await Corrida.findOne({
            tokenRastreamento: req.params.token,
            status: { $in: ['aceita', 'em_andamento', 'a_caminho'] }
        }).lean();

        if (!corrida) return res.json({ sucesso: false, erro: 'Corrida não encontrada ou já finalizada' });

        const motorista = corrida.motoristaId
            ? await Motorista.findById(corrida.motoristaId, 'nomeCompleto latitude longitude veiculo avaliacao').lean()
            : null;

        res.json({
            sucesso: true,
            corrida: {
                status: corrida.status,
                origem: corrida.enderecoOrigemTexto,
                destino: corrida.enderecoDestinoTexto,
            },
            motorista: motorista ? {
                nome: motorista.nomeCompleto,
                lat: motorista.latitude,
                lng: motorista.longitude,
                veiculo: motorista.veiculo,
                avaliacao: motorista.avaliacao,
            } : null
        });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});


// ── POST /api/landing/admin/criar ────────────────────────────────────
// Cria novo admin de mobilidade — protegido por senha master da landing
router.post('/admin/criar', async (req, res) => {
    try {
        const SENHA_MASTER = '121212';
        const { senhaMaster, nomeMarca, cidade, estado, whatsappCentral, email, senha } = req.body;

        if (senhaMaster !== SENHA_MASTER) {
            return res.json({ sucesso: false, erro: 'Senha incorreta.' });
        }
        if (!nomeMarca || !cidade || !whatsappCentral || !email || !senha) {
            return res.json({ sucesso: false, erro: 'Preencha todos os campos obrigatórios.' });
        }

        const existente = await Admin.findOne({ email: email.toLowerCase() });
        if (existente) return res.json({ sucesso: false, erro: 'E-mail já cadastrado.' });

        let tel = (whatsappCentral || '').replace(/\D/g, '');
        if ((tel.length === 11 || tel.length === 10) && !tel.startsWith('55')) tel = '55' + tel;

        const admin = await Admin.create({
            nome: nomeMarca,
            email: email.toLowerCase(),
            senha,
            empresa: nomeMarca,
            nomeMarca,
            cidade,
            estado: estado || '',
            whatsappCentral: tel,
            ativo: true,
            visibleLanding: true,
            origem: 'landing_page',
            tipoAdmin: 'transporte',
        });

        res.json({
            sucesso: true,
            adminId: admin._id,
            mensagem: '✅ Central criada com sucesso! Já aparece na lista de cidades. Acesse o painel para configurar PIX e mensalidades.',
        });
    } catch (e) {
        console.error('[Landing] Erro criar admin:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});


// ── GET /api/landing/places/autocomplete ─────────────────────────────
// Autocomplete de cidades via Google Places
router.get('/places/autocomplete', async (req, res) => {
    try {
        const input = req.query.input || '';
        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key) return res.json({ predictions: [] });
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=(cities)&language=pt-BR&components=country:br&key=${key}`;
        const r = await axios.get(url);
        res.json({ predictions: r.data.predictions || [] });
    } catch(e) {
        res.json({ predictions: [] });
    }
});

// ── GET /api/landing/places/details ──────────────────────────────────
// Detalhes do lugar (para pegar UF do estado)
router.get('/places/details', async (req, res) => {
    try {
        const place_id = req.query.place_id || '';
        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key) return res.json({ result: {} });
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=address_components&language=pt-BR&key=${key}`;
        const r = await axios.get(url);
        res.json({ result: r.data.result || {} });
    } catch(e) {
        res.json({ result: {} });
    }
});

module.exports = router;
