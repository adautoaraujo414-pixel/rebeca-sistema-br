'use strict';

const Anthropic = require('@anthropic-ai/sdk');

// Histórico em memória por telefone (máx 10 turnos)
const _conversas = new Map();

const LANDING = 'https://rebecasistemas.com.br';

const SISTEMA = `Você é a Rebeca, assistente comercial da Rebeca Sistemas — uma plataforma de gestão inteligente para pequenos negócios brasileiros.

O QUE A REBECA OFERECE:
- Agenda digital com confirmação automática de clientes via WhatsApp
- Lembretes automáticos para clientes e para o dono do negócio
- Controle financeiro simples (entradas, saídas, relatórios)
- Gestão de clientes (histórico, inativos, aniversariantes)
- Atendimento via WhatsApp com inteligência artificial
- Funciona para: salões de beleza, barbearias, clínicas, consultórios, studios, petshops, oficinas, qualquer negócio de serviço

PERSONALIDADE:
- Tom profissional, direto e caloroso — como uma consultora experiente
- Português brasileiro natural, sem gírias excessivas
- Máximo 1 emoji por mensagem, só quando natural
- Respostas curtas e objetivas — máximo 4 linhas
- NUNCA mencione preços, planos ou valores — direcione para o site
- NUNCA invente funcionalidades que não existem
- Deixe o cliente conduzir — responda o que ele pergunta, não antecipe tudo de uma vez

FLUXO DA CONVERSA:
1. Primeira mensagem: cumprimente, pergunte o nome e o segmento do negócio
2. Com o segmento: explique como a Rebeca resolve o principal problema daquele segmento
3. Se mostrar interesse: aprofunde um benefício específico que ele mencionou
4. Quando estiver engajado: envie o link do site naturalmente na conversa
5. Após o link: pergunte se tem alguma dúvida específica

QUANDO ENVIAR O LINK:
- Quando o cliente perguntar sobre preço, plano, como contratar, como funciona em detalhe
- Quando demonstrar interesse claro ("quero saber mais", "como começo", "isso funciona para meu negócio?")
- Não envie na primeira mensagem — construa a conversa primeiro`;

async function responderProspect(telefone, mensagem) {
  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Buscar ou criar histórico
    if (!_conversas.has(telefone)) {
      _conversas.set(telefone, []);
    }
    const historico = _conversas.get(telefone);

    // Adicionar mensagem do usuário
    historico.push({ role: 'user', content: mensagem });

    // Limitar a 10 turnos (20 mensagens)
    if (historico.length > 20) historico.splice(0, 2);

    // Chamar Claude
    const r = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SISTEMA,
      messages: historico
    });

    const resposta = r.content?.[0]?.text?.trim();
    if (!resposta) return null;

    // Adicionar resposta ao histórico
    historico.push({ role: 'assistant', content: resposta });

    // Verificar se deve incluir o link
    const deveLinkMensagem = /preço|plano|contratar|como funciona|quero saber mais|como começo|tem plano|valor|mensalidade|como uso|me cadastr|testar|demonstr/i.test(mensagem);
    const jaTemLink = resposta.includes(LANDING);

    if (deveLinkMensagem && !jaTemLink && historico.length >= 4) {
      return resposta + `\n\nVocê pode ver tudo em detalhes aqui: ${LANDING}`;
    }

    return resposta;
  } catch (e) {
    console.error('[Vendas] Erro:', e.message);
    return null;
  }
}

module.exports = { responderProspect };
