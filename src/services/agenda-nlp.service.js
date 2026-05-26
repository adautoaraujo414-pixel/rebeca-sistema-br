/**
 * agenda-nlp.service.js
 * Camada semântica flexível — entende intenção humana mesmo com:
 * - erro de português, frase cortada, áudio mal transcrito
 * - ordem invertida, palavras faltando, informalidade
 */

// ── 1. NORMALIZAÇÃO ──────────────────────────────────────────────────────────
function normalizar(txt) {
  if (!txt) return '';
  return txt
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s\d.,]/g, ' ')                     // remove pontuação especial
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 2. DICIONÁRIO DE SINÔNIMOS / ALIASES ────────────────────────────────────
const SINONIMOS = {
  // verbos de saída
  'gastei':'saida','gasto':'saida','paguei':'saida','comprei':'saida',
  'saiu':'saida','saida':'saida','debitou':'saida','descontou':'saida',
  'tirei':'saida','foi':'saida','saindo':'saida',
  // verbos de entrada
  'recebi':'entrada','entrou':'entrada','caiu':'entrada','ganhei':'entrada',
  'fiz':'entrada','vendi':'entrada','veio':'entrada','pix':'entrada',
  'transferencia':'entrada','deposito':'entrada',
  // categorias — combustível
  'gasolina':'combustivel','diesel':'combustivel','alcool':'combustivel',
  'etanol':'combustivel','posto':'combustivel','abasteci':'combustivel',
  'abastecimento':'combustivel','combustivel':'combustivel','combust':'combustivel',
  'combustil':'combustivel','conbustivel':'combustivel','combistivel':'combustivel',
  // categorias — alimentação  
  'almoco':'alimentacao','almoço':'alimentacao','janta':'alimentacao',
  'jantar':'alimentacao','cafe':'alimentacao','lanche':'alimentacao',
  'comida':'alimentacao','refeicao':'alimentacao','refeição':'alimentacao',
  'restaurante':'alimentacao','ifood':'alimentacao','rappi':'alimentacao',
  // categorias — mercado
  'mercado':'mercado','supermercado':'mercado','feira':'mercado',
  'hortifruti':'mercado','padaria':'mercado','acougue':'mercado',
  // categorias — saúde
  'farmacia':'saude','remedio':'saude','medico':'saude','consulta':'saude',
  'dentista':'saude','hospital':'saude','clinica':'saude','fisio':'saude',
  // categorias — beleza
  'cabeleireiro':'beleza','cabeleireira':'beleza','barbeiro':'beleza',
  'barbearia':'beleza','salao':'beleza','manicure':'beleza','pedicure':'beleza',
  'estetica':'beleza','depilacao':'beleza','sobrancelha':'beleza','unhas':'beleza',
  // categorias — lazer/academia
  'academia':'lazer','gym':'lazer','cinema':'lazer','teatro':'lazer',
  'show':'lazer','festa':'lazer','viagem':'lazer','hotel':'lazer',
  // categorias — transporte
  'uber':'transporte','taxi':'transporte','onibus':'transporte',
  'metro':'transporte','passagem':'transporte','corrida':'transporte',
  // categorias — educação
  'escola':'educacao','faculdade':'educacao','curso':'educacao',
  'colegio':'educacao','livro':'educacao',
  // categorias — contas
  'luz':'energia','energia':'energia','internet':'internet','wifi':'internet',
  'agua':'agua','aluguel':'aluguel','condominio':'aluguel',
  'telefone':'telefone','celular':'telefone',
  // categorias — negócio
  'fornecedor':'produtos','estoque':'produtos','material':'produtos',
  'equipamento':'produtos','insumo':'produtos',
  'imposto':'impostos','taxa':'impostos','contador':'impostos',
  'salario':'salario','funcionario':'salario','folha':'salario',
  // transferência
  'transferencia':'transferencia','ted':'transferencia','doc':'transferencia',
  // outros
  'servico':'servicos','manutencao':'servicos','conserto':'servicos',
  'reparo':'servicos','instalacao':'servicos',
  'limpeza':'limpeza','higiene':'limpeza',
};

// ── 3. EXTRAIR VALOR MONETÁRIO ───────────────────────────────────────────────
function extrairValor(txt) {
  const n = normalizar(txt);
  // "4 mil", "4k"
  const milM = n.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (milM) return parseFloat(milM[1].replace(',','.')) * 1000;
  const kM = n.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kM) return parseFloat(kM[1].replace(',','.')) * 1000;
  // "R$ 50,00" ou "50,00" ou "50.00" ou "50"
  const valM = n.match(/(?:r\$?\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/);
  if (valM) {
    const s = valM[1].replace(',','.');
    const v = parseFloat(s);
    return (!isNaN(v) && v > 0) ? v : null;
  }
  return null;
}

// ── 4. EXTRAIR CATEGORIA ─────────────────────────────────────────────────────
function extrairCategoria(txt) {
  const n = normalizar(txt);
  const palavras = n.split(/\s+/);
  // procura cada palavra no dicionário de sinônimos
  for (const p of palavras) {
    if (SINONIMOS[p] && !['saida','entrada'].includes(SINONIMOS[p])) {
      return SINONIMOS[p];
    }
  }
  // bigrams (2 palavras juntas) — ex: "posto combustivel"
  for (let i = 0; i < palavras.length - 1; i++) {
    const bi = palavras[i] + ' ' + palavras[i+1];
    if (SINONIMOS[bi]) return SINONIMOS[bi];
  }
  return 'outros';
}

// ── 5. DETECTAR INTENÇÃO ─────────────────────────────────────────────────────
function detectarIntencao(txt) {
  const n = normalizar(txt);
  const palavras = new Set(n.split(/\s+/));

  // Consulta tem prioridade sobre registro
  if (/quanto|caixa|resumo|movimento|lucro|faturei|faturamento|extrato|relatorio|oq tenho|o que tenho|tem cliente|agenda hoje|agenda amanha/.test(n)) {
    return 'consulta';
  }

  // Lembrete / agenda
  if (/lembra|lembrete|agenda|marca.*horario|horario.*marca|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo/.test(n) &&
      !/gastei|saiu|paguei|recebi|entrou|saida|entrada/.test(n)) {
    return 'lembrete';
  }

  // Detectar intenção financeira por verbos de saída
  const temSaida = palavras.has('saida') || palavras.has('gastei') || palavras.has('gasto') ||
    palavras.has('paguei') || palavras.has('comprei') || palavras.has('saiu') ||
    palavras.has('debitou') || palavras.has('descontou') || palavras.has('tirei') ||
    n.includes('saida') || n.includes('saiu') || n.includes('gasto') ||
    n.includes('paguei') || n.includes('gastei');

  const temEntrada = palavras.has('entrada') || palavras.has('recebi') || palavras.has('entrou') ||
    palavras.has('caiu') || palavras.has('ganhei') || palavras.has('vendi') ||
    palavras.has('pix') || n.includes('recebi') || n.includes('entrou') || n.includes('caiu');

  // Tem valor + categoria conhecida = financeiro implícito
  const val = extrairValor(txt);
  const cat = extrairCategoria(txt);
  const temCatConhecida = cat !== 'outros';

  if (temSaida && val) return 'saida';
  if (temEntrada && val) return 'entrada';

  // Verbo de saída + categoria conhecida (mesmo sem valor) = saída
  if (temSaida && temCatConhecida) return 'saida';

  // Implícito: só valor + categoria de despesa = saída
  if (val && temCatConhecida && !temEntrada) return 'saida';

  // Só valor = ambíguo, mas tende a saída
  if (val && !temEntrada) return 'saida_ambigua';
  if (val && temEntrada) return 'entrada';

  return 'desconhecido';
}

// ── 6. PARSE COMPLETO ────────────────────────────────────────────────────────
function parsear(txt) {
  const intencao  = detectarIntencao(txt);
  const valor     = extrairValor(txt);
  const categoria = extrairCategoria(txt);
  const normalizado = normalizar(txt);

  return { intencao, valor, categoria, normalizado, original: txt };
}

// ── 7. TESTES INTERNOS ───────────────────────────────────────────────────────
function testar() {
  const casos = [
    // financeiro saída
    { txt: 'marca 50 gasolina',             esperado: { intencao:'saida', valor:50,    categoria:'combustivel' } },
    { txt: '50 gasolina',                   esperado: { intencao:'saida', valor:50,    categoria:'combustivel' } },
    { txt: 'gastei 20 almoço',              esperado: { intencao:'saida', valor:20,    categoria:'alimentacao' } },
    { txt: 'saiu 30 combustível',           esperado: { intencao:'saida', valor:30,    categoria:'combustivel' } },
    { txt: 'Saída 100 reais Tharsis',       esperado: { intencao:'saida', valor:100,   categoria:'outros'      } },
    { txt: 'registra saida de 20 reais posto de combustil', esperado: { intencao:'saida', valor:20, categoria:'combustivel' } },
    { txt: 'Resistira saida de 10,47 refeicao', esperado: { intencao:'saida', valor:10.47, categoria:'alimentacao' } },
    { txt: 'combustivel 50',                esperado: { intencao:'saida', valor:50,    categoria:'combustivel' } },
    { txt: 'fornecedor 300',                esperado: { intencao:'saida', valor:300,   categoria:'produtos'    } },
    { txt: 'gasto internet',                esperado: { intencao:'saida', valor:null,  categoria:'internet'    } },
    // financeiro entrada
    { txt: 'entrou 120 pix',                esperado: { intencao:'entrada', valor:120,  categoria:'outros' } },
    { txt: 'recebi 90',                     esperado: { intencao:'entrada', valor:90,   categoria:'outros' } },
    { txt: '300 cliente joao',              esperado: { intencao:'saida_ambigua', valor:300 } },
    // áudio distorcido
    { txt: 'combistivel 50',                esperado: { intencao:'saida', valor:50,    categoria:'combustivel' } },
    { txt: 'conbustivel 40',                esperado: { intencao:'saida', valor:40,    categoria:'combustivel' } },
    { txt: 'posto combustil 20',            esperado: { intencao:'saida', valor:20,    categoria:'combustivel' } },
  ];

  let ok = 0, fail = 0;
  for (const c of casos) {
    const r = parsear(c.txt);
    const passou = r.intencao === c.esperado.intencao &&
      (c.esperado.valor === undefined || r.valor === c.esperado.valor) &&
      (c.esperado.categoria === undefined || r.categoria === c.esperado.categoria);
    console.log(passou ? '✅' : '❌', `"${c.txt}"`);
    if (!passou) {
      console.log('   esperado:', c.esperado);
      console.log('   obtido:  ', { intencao:r.intencao, valor:r.valor, categoria:r.categoria });
      fail++;
    } else ok++;
  }
  console.log(`\n${ok} passaram, ${fail} falharam`);
}

module.exports = { parsear, normalizar, extrairValor, extrairCategoria, detectarIntencao, testar };
