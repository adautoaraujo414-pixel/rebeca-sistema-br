const { Admin } = require('../models');

const PrecoSimplesService = {
    // Obter período do dia
    getPeriodo(hora) {
        if (hora >= 6 && hora < 12) return 'manha';
        if (hora >= 12 && hora < 18) return 'tarde';
        if (hora >= 18 && hora < 24) return 'noite';
        return 'madrugada'; // 00:00 - 06:00
    },

    // Obter tipo do dia
    getTipoDia(diaSemana) {
        if (diaSemana === 0) return 'domingo';
        if (diaSemana === 6) return 'sabado';
        return 'semana';
    },

    // Calcular preço simples
    async calcularPreco(adminId, lat = null, lng = null) {
        try {
            const admin = await Admin.findById(adminId).lean();
            if (!admin) return { preco: 15.00, periodo: 'padrao', tipoDia: 'semana' };

            // 0. Verificar zona de preço fixo por localização
            if (lat && lng) {
                try {
                    const PrecoAdminService = require('./preco-admin.service');
                    const zonaResult = await PrecoAdminService.verificarZonaPreco(adminId, lat, lng);
                    if (zonaResult) {
                        return {
                            preco: zonaResult.precoFixo,
                            periodo: 'zona',
                            tipoDia: 'zona',
                            zona: zonaResult.zona.nome,
                            motivo: 'Zona: ' + zonaResult.zona.nome
                        };
                    }
                } catch(e) { console.log('[ZONA] Erro verificar zona:', e.message); }
            }

            // 1. Se preço fixo está ativo (festa/evento)
            if (admin.precoFixo?.ativo) {
                return {
                    preco: admin.precoFixo.valor,
                    periodo: 'fixo',
                    tipoDia: 'evento',
                    motivo: admin.precoFixo.motivo || 'Preço especial'
                };
            }

            // 2. Se modo é calculado, usar sistema antigo
            if (admin.modoPreco === 'calculado') {
                return null; // Sinaliza para usar o cálculo por km
            }

            // 3. Usar preço simples por dia/período
            const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            const hora = agora.getHours();
            const diaSemana = agora.getDay();
            
            // Bug A fix: usar horariosSimples do admin se configurado
            let periodo = this.getPeriodo(hora);
            const tipoDia = this.getTipoDia(diaSemana);
            if (admin.horariosSimples) {
                const horaStr = hora.toString().padStart(2,'0') + ':00';
                for (const [per, cfg] of Object.entries(admin.horariosSimples)) {
                    if (cfg.inicio && cfg.fim) {
                        const ini = cfg.inicio, fim = cfg.fim;
                        if (fim > ini) { if (horaStr >= ini && horaStr < fim) { periodo = per; break; } }
                        else { if (horaStr >= ini || horaStr < fim) { periodo = per; break; } }
                    }
                }
            }

            // Buscar preço configurado ou usar padrão
            const precos = admin.precosSimples || {
                semana: { manha: 15, tarde: 15, noite: 18, madrugada: 20 },
                sabado: { manha: 18, tarde: 18, noite: 22, madrugada: 25 },
                domingo: { manha: 18, tarde: 18, noite: 20, madrugada: 25 }
            };

            const preco = precos[tipoDia]?.[periodo] || 15.00;

            const _diaNome = { semana: 'Seg–Sex', sabado: 'Sábado', domingo: 'Domingo' }[tipoDia] || tipoDia;
            const _perNome = { manha: 'Manhã (06–12h)', tarde: 'Tarde (12–18h)', noite: 'Noite (18–00h)', madrugada: 'Madrugada (00–06h)' }[periodo] || periodo;
            return {
                preco,
                periodo,
                tipoDia,
                horaAtual: hora,
                detalhes: `${_diaNome} · ${_perNome}`
            };
        } catch (e) {
            console.error('[PRECO-SIMPLES] Erro:', e.message);
            return { preco: 15.00, periodo: 'erro', tipoDia: 'padrao' };
        }
    },

    // Salvar configuração de preços simples
    async salvarPrecos(adminId, dados) {
        try {
            const update = {};
            
            if (dados.precosSimples) {
                update.precosSimples = dados.precosSimples;
            }
            if (dados.horariosSimples) {
                update.horariosSimples = dados.horariosSimples;
            }
            if (dados.precoFixo !== undefined) {
                update.precoFixo = dados.precoFixo;
            }
            // Bug B fix: garantir que precoFixo.ativo=false é sempre salvo
            if (dados.precoFixo && dados.precoFixo.ativo === false) {
                update.precoFixo = dados.precoFixo;
            }
            if (dados.modoPreco) {
                update.modoPreco = dados.modoPreco;
            }

            // Usar $set com notação de ponto para garantir salvamento de subdocumentos
            const setObj = {};
            if (update.modoPreco) setObj['modoPreco'] = update.modoPreco;
            // Bug B fix: !== undefined para não ignorar {ativo:false}
            if (update.precoFixo !== undefined) setObj['precoFixo'] = update.precoFixo;
            if (update.horariosSimples) {
                ['manha','tarde','noite','madrugada'].forEach(p => {
                    if (update.horariosSimples[p]) {
                        setObj['horariosSimples.' + p + '.inicio'] = update.horariosSimples[p].inicio;
                        setObj['horariosSimples.' + p + '.fim'] = update.horariosSimples[p].fim;
                    }
                });
            }
            if (update.precosSimples) {
                ['semana','sabado','domingo','feriado'].forEach(d => {
                    if (update.precosSimples[d]) {
                        ['manha','tarde','noite','madrugada'].forEach(p => {
                            if (update.precosSimples[d][p] !== undefined) {
                                setObj['precosSimples.' + d + '.' + p] = update.precosSimples[d][p];
                            }
                        });
                    }
                });
            }
            await Admin.findByIdAndUpdate(adminId, { $set: setObj }, { new: true });
            return { sucesso: true };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Obter configuração atual
    async getConfig(adminId) {
        try {
            const admin = await Admin.findById(adminId).lean();
            return {
                modoPreco: admin?.modoPreco || 'simples',
                precoFixo: admin?.precoFixo || { ativo: false, valor: 15 },
                precosSimples: admin?.precosSimples || {
                    semana: { manha: 15, tarde: 15, noite: 18, madrugada: 20 },
                    sabado: { manha: 18, tarde: 18, noite: 22, madrugada: 25 },
                    domingo: { manha: 18, tarde: 18, noite: 20, madrugada: 25 }
                },
                horariosSimples: admin?.horariosSimples || {}
            };
        } catch (e) {
            return {
                modoPreco: 'simples',
                precoFixo: { ativo: false, valor: 15 },
                precosSimples: {
                    semana: { manha: 15, tarde: 15, noite: 18, madrugada: 20 },
                    sabado: { manha: 18, tarde: 18, noite: 22, madrugada: 25 },
                    domingo: { manha: 18, tarde: 18, noite: 20, madrugada: 25 }
                }
            };
        }
    }
};

module.exports = PrecoSimplesService;
