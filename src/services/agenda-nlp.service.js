
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\d.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 1b. SERVIÇOS / COMPROMISSOS ──────────────────────────────────────────────
const SERVICOS_AGENDA = new Set([
  'dentista','medico','medica','consulta','exame','fisio','psicologo','psicologa',
  'cabelo','cabeleireiro','cabeleireira','corte','escova','hidratacao',
  'manicure','pedicure','depilacao','sobrancelha','unhas',
  'reuniao','meeting','entrevista','apresentacao','palestra',
  'academia','treino','aula','curso','escola','faculdade',
  'aniversario','festa','casamento','formatura',
  'banco','cartorio','prefeitura','consulado',
  'viagem','voo','embarque','hotel',
  'veterinario','veterinaria','pet',
  'mercado','feira','compras','supermercado',
]);

// ── 2. DICIONÁRIO DE SINÔNIMOS ────────────────────────────────────────────────
const SINONIMOS = {
  // verbos de saída
  'gastei':'saida','gasto':'saida','paguei':'saida','comprei':'saida',
  'saiu':'saida','saida':'saida','debitou':'saida','descontou':'saida',
  'tirei':'saida','foi':'saida','saindo':'saida',
  // verbos de entrada
  'recebi':'entrada','entrou':'entrada','caiu':'entrada','ganhei':'entrada',
  'fiz':'entrada','vendi':'entrada','veio':'entrada','pix':'entrada',
  'transferencia':'entrada','deposito':'entrada',
  'cobrei':'entrada','cobrado':'entrada','cobrou':'entrada',
  'recebido':'entrada','recebemos':'entrada',
  // combustível — com variações de áudio
  'gasolina':'combustivel','diesel':'combustivel','alcool':'combustivel',
  'etanol':'combustivel','posto':'combustivel','abasteci':'combustivel',
  'abastecimento':'combustivel','combustivel':'combustivel','combust':'combustivel',
  'combustil':'combustivel','conbustivel':'combustivel','combistivel':'combustivel',
  'conjstivel':'combustivel','combutivel':'combustivel','conbust':'combustivel',
  'combust':'combustivel','combustivelive':'combustivel','cumbustivel':'combustivel',
  'conbustivel':'combustivel','combustivil':'combustivel','combuistivel':'combustivel',
  // alimentação
  'almoco':'alimentacao','almoco':'alimentacao','janta':'alimentacao',
  'jantar':'alimentacao','cafe':'alimentacao','lanche':'alimentacao',
  'comida':'alimentacao','refeicao':'alimentacao','restaurante':'alimentacao',
  'ifood':'alimentacao','rappi':'alimentacao',
  // mercado
  'supermercado':'mercado','hortifruti':'mercado','padaria':'mercado','acougue':'mercado',
  // saúde
  'farmacia':'saude','remedio':'saude','hospital':'saude','clinica':'saude',
  // beleza
  'cabeleireiro':'beleza','cabeleireira':'beleza','barbeiro':'beleza',
  'barbearia':'beleza','salao':'beleza','manicure':'beleza','pedicure':'beleza',
  'estetica':'beleza','depilacao':'beleza','sobrancelha':'beleza','unhas':'beleza',
  'escova':'beleza','tintura':'beleza','botox':'beleza','progressiva':'beleza',
  // lazer
  'cinema':'lazer','teatro':'lazer','show':'lazer','academia':'lazer','gym':'lazer',
  // transporte
  'uber':'transporte','taxi':'transporte','onibus':'transporte',
  'metro':'transporte','passagem':'transporte','corrida':'transporte',
  // educação
  'escola':'educacao','faculdade':'educacao','curso':'educacao','colegio':'educacao','livro':'educacao',
  // contas
  'luz':'energia','energia':'energia','internet':'internet','wifi':'internet',
  'agua':'agua','aluguel':'aluguel','condominio':'aluguel',
  'telefone':'telefone','celular':'telefone',
  // negócio
  'fornecedor':'produtos','estoque':'produtos','material':'produtos',
  'equipamento':'produtos','insumo':'produtos',
  'imposto':'impostos','taxa':'impostos','contador':'impostos',
  'salario':'salario','funcionario':'salario','folha':'salario',
  // serviços
  'servico':'servicos','manutencao':'servicos','conserto':'servicos',
  'reparo':'servicos','instalacao':'servicos','limpeza':'limpeza','higiene':'limpeza',
};

// ── 2b. LEVENSHTEIN — corrige erros de áudio não mapeados ────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_,i) => Array.from({length: n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
const _ALVOS_FUZZY = ['combustivel','alimentacao','mercado','farmacia','aluguel','energia','internet','agua','salario','impostos','produtos','servicos','beleza','transporte','lazer','educacao'];
function fuzzyCategoria(palavra) {
  if (palavra.length < 4) return null;
  let melhor = null, melhorDist = 99;
  for (const alvo of _ALVOS_FUZZY) {
    const d = levenshtein(palavra, alvo);
    const limiar = Math.floor(alvo.length * 0.35); // até 35% de diferença
    if (d < melhorDist && d <= limiar) { melhorDist = d; melhor = alvo; }
  }
  return melhor;
}


// ── 2c. NÚMEROS POR EXTENSO → dígitos ────────────────────────────────────────
function converterExtenso(txt) {
  const _map = {
    'zero':0,'um':1,'uma':1,'dois':2,'duas':2,'tres':3,'quatro':4,'cinco':5,
    'seis':6,'sete':7,'oito':8,'nove':9,'dez':10,'onze':11,'doze':12,
    'treze':13,'quatorze':14,'catorze':14,'quinze':15,'dezesseis':16,
    'dezessete':17,'dezoito':18,'dezenove':19,'vinte':20,'trinta':30,
    'quarenta':40,'cinquenta':50,'sessenta':60,'setenta':70,'oitenta':80,
    'noventa':90,'cem':100,'cento':100,'duzentos':200,'trezentos':300,
    'quatrocentos':400,'quinhentos':500,'seiscentos':600,'setecentos':700,
    'oitocentos':800,'novecentos':900,'mil':1000
  };
  // "cento e cinquenta" → 150, "quarenta e cinco" → 45
  let s = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  // Padrão: X e Y (dezena + unidade ou centena + dezena)
  s = s.replace(/(\w+)\s+e\s+(\w+)/g, (_, a, b) => {
    const va = _map[a], vb = _map[b];
    if (va !== undefined && vb !== undefined) return String(va + vb);
    return _ ;
  });
  // Padrão: X mil Y → X*1000+Y
  s = s.replace(/(\d+)\s+mil(?:\s+(\d+))?/g, (_, m, r) => String(parseInt(m)*1000 + parseInt(r||0)));
  // Palavras isoladas
  s = s.replace(/\b(zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b/g,
    w => { const n = _map[w.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()]; return n !== undefined ? String(n) : w; });
  return s;
}

// ── 3. EXTRAIR VALOR MONETÁRIO ────────────────────────────────────────────────
function extrairValor(txt) {
  const n = converterExtenso(normalizar(txt));

  // Detectar recorrente para NÃO confundir "dia 10" com valor
  // Detectar recorrente — para não confundir "dia 10" com valor
  const isRecorrente = /todo\s*(?:dia|mes)\s*\d|toda?\s*(?:semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)|para\s*todo\s*dia\s*\d|recorrente|mensalmente|diariamente/.test(n);
  // Se recorrente, remover "dia X" do texto antes de qualquer match de valor
  const nValor = isRecorrente ? n.replace(/\b(?:todo\s*)?dia\s*\d{1,2}\b/g, '').replace(/\bpara\b/g, '') : n;

  // "4 mil", "4k"
  const milM = nValor.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (milM) return parseFloat(milM[1].replace(',','.')) * 1000;
  const kM = nValor.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kM) return parseFloat(kM[1].replace(',','.')) * 1000;

  // Formato brasileiro com milhar: 1.200,00 ou 1.200
  const milhar = nValor.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)/);
  if (milhar) return parseFloat(milhar[1].replace(/\./g,'').replace(',','.'));

  // R$ + valor
  const rs = nValor.match(/r\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (rs) return parseFloat(rs[1].replace(',','.'));

  // valor + reais/conto
  const reais = nValor.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|pila)\b/);
  if (reais) return parseFloat(reais[1].replace(',','.'));

  // vírgula decimal: 10,50
  const virgula = nValor.match(/\b(\d+),(\d{2})\b/);
  if (virgula) return parseFloat(virgula[1] + '.' + virgula[2]);

  // número solto — mas se for recorrente, ignora o "dia X"
  if (isRecorrente) {
    // pega qualquer número que NÃO seja precedido de "dia"
    const mSemDia = nValor.replace(/\btodo\s*dia\s*\d+/g,'').replace(/\bdia\s*\d+/g,'').match(/\b(\d+(?:[.,]\d+)?)\b/);
    if (mSemDia) { const v = parseFloat(mSemDia[1].replace(',','.')); return v > 0 ? v : null; }
    return null;
  }

  const solto = nValor.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (solto) { const v = parseFloat(solto[1].replace(',','.')); return v > 0 ? v : null; }
  return null;
}

// ── 4. EXTRAIR CATEGORIA ──────────────────────────────────────────────────────
function extrairCategoria(txt) {
  const n = normalizar(txt);
  const palavras = n.split(/\s+/);

  // Mapeamento direto
  for (const p of palavras) {
    if (SINONIMOS[p] && !['saida','entrada'].includes(SINONIMOS[p])) return SINONIMOS[p];
  }

  // Bigrams
  for (let i = 0; i < palavras.length - 1; i++) {
    const bi = palavras[i] + ' ' + palavras[i+1];
    if (SINONIMOS[bi]) return SINONIMOS[bi];
  }

  // Fuzzy — corrige erros de áudio
  for (const p of palavras) {
    if (p.length >= 5) {
      const fc = fuzzyCategoria(p);
      if (fc) return fc;
    }
  }

  return 'outros';
}

// ── 5. DETECTAR RECORRENTE ────────────────────────────────────────────────────
function detectarRecorrente(txt) {
  const n = normalizar(txt);
  // Mensal com dia: "todo dia 10", "todo mês dia 5", "dia 10 de cada mês", "mensalmente dia 5"
  const mDia = n.match(/(?:todo\s*(?:mes\s*)?|cada\s*mes\s*|mensalmente\s*)?dia\s*(\d{1,2})(?:\s*(?:de\s*)?(?:cada\s*)?mes)?/);
  if (mDia && /mes|mensal|cada/.test(n)) return { tipo: 'mensal', dia: parseInt(mDia[1]) };
  const mDia2 = n.match(/todo\s*(?:mes\s*)?dia\s*(\d{1,2})/);
  if (mDia2) return { tipo: 'mensal', dia: parseInt(mDia2[1]) };
  // "dia 10" isolado (sem todo) — inferir mensal quando contexto sugere recorrência
  const mDia3 = n.match(/(?:^|\s)dia\s+(\d{1,2})(?:\s|$)/);
  if (mDia3 && /lembrete|recorrente|pagar|todo|mes|mensal/.test(n)) return { tipo: 'mensal', dia: parseInt(mDia3[1]) };
  // Mensal sem dia: "todo mês", "mensalmente", "todo mes"
  if (/todo\s*mes|mensalmente|mensais|cada\s*mes/.test(n)) return { tipo: 'mensal', dia: null };
  // Anual: "todo ano", "anualmente"
  if (/todo\s*ano|anualmente/.test(n)) return { tipo: 'anual' };
  // Diário: "todo dia", "todos os dias", "diariamente", "de segunda a sexta"
  if (/todo\s*dia(?!\s*\d)|todos\s*os\s*dias|diariamente|segunda\s*a\s*sexta/.test(n)) return { tipo: 'diario' };
  // Semanal: "toda segunda", "toda terça", etc
  const mSem = n.match(/toda?\s*(segunda|terca|quarta|quinta|sexta|sabado|domingo)(-feira)?/);
  if (mSem) return { tipo: 'semanal', diaSemana: mSem[1] };
  // "toda semana"
  if (/toda\s*semana|semanalmente/.test(n)) return { tipo: 'semanal', diaSemana: null };
  return null;
}

// ── 6. DETECTAR INTENÇÃO ─────────────────────────────────────────────────────
function detectarIntencao(txt) {
  const n = converterExtenso(normalizar(txt));
  const palavras = new Set(n.split(/\s+/));

  // Consulta
  if (/quanto|caixa|resumo|movimento|lucro|faturei|faturamento|extrato|relatorio|oq tenho|o que tenho|tem cliente|agenda hoje|agenda amanha/.test(n)) {
    return 'consulta';
  }

  // Recorrente
  if (detectarRecorrente(txt)) return 'recorrente';

  // Lembrete explícito
  if (/lembra|lembrete|nao me deixa esquecer|anota ai/.test(n) &&
      !/gastei|saiu|paguei|recebi|entrou/.test(n)) {
    return 'lembrete';
  }

  // Entrada explícita — "cobrei", "recebi" + valor
  const temEntradaExplicita = /cobrei|cobrou|cobrado|recebi|entrou|caiu|ganhei|vendi|pix\s*\d|recebido/.test(n);
  const val = extrairValor(txt);
  if (temEntradaExplicita && val) return 'entrada';

  // Lembrete implícito: dia + serviço conhecido
  const temDia = /amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}h|\d{1,2}:\d{2}/.test(n);
  const temServico = n.split(/\s+/).some(p => SERVICOS_AGENDA.has(p));
  if (temDia && temServico && !/gastei|saiu|paguei|recebi|entrou|saida|entrada/.test(n)) return 'lembrete';

  const temHora = /\d{1,2}\s*h\b|\d{1,2}:\d{2}/.test(n);
  if (temDia && temHora && !/gastei|saiu|paguei|recebi|entrou|saida|entrada|reais/.test(n)) return 'lembrete';

  if (temServico && !/gastei|saiu|paguei|recebi|entrou|saida|entrada/.test(n)) return 'lembrete';

  // Saída
  const temSaida = /saida|gastei|gasto|paguei|comprei|saiu|debitou|descontou|tirei/.test(n);
  const cat = extrairCategoria(txt);
  const temCat = cat !== 'outros';

  if (temSaida && val) return 'saida';
  if (temEntradaExplicita && val) return 'entrada';
  if (temSaida && temCat) return 'saida';
  if (val && temCat && !temEntradaExplicita) return 'saida';
  if (val && !temEntradaExplicita) return 'saida_ambigua';
  if (val && temEntradaExplicita) return 'entrada';

  return 'desconhecido';
}

// ── 7. PARSE COMPLETO ─────────────────────────────────────────────────────────
function parsear(txt) {
  const intencao    = detectarIntencao(txt);
  const valor       = extrairValor(txt);
  const categoria   = extrairCategoria(txt);
  const normalizado = normalizar(txt);
  const recorrente  = detectarRecorrente(txt);

  let textoLembrete = null;
  if (intencao === 'lembrete' || intencao === 'recorrente') {
    textoLembrete = normalizado
      // 1. Remover nome da assistente
      .replace(/\brebeca\b[,.]?\s*/gi, '')
      // 2. Remover frases de cortesia/comando
      .replace(/\b(eu quero que voce|quero que voce|pode|por favor|pfv|pf|consegue|preciso que voce)\s*/gi, '')
      .replace(/\b(crie?|criar|fazer|faz|coloca|coloque|adiciona|adicione|registra|registre|anota|anote)\b\s*/gi, '')
      .replace(/\b(me lembr[ae]|me avis[ae]|me notific[ae]|lembrete|aviso|alerta|agenda|marca|marque)\b\s*/gi, '')
      // 3. Remover "um/uma lembrete/aviso/alerta"
      .replace(/\b(um|uma)\s+(lembrete|aviso|alerta|notificacao)\s*/gi, '')
      // 4. Remover palavras de recorrência
      .replace(/\b(recorrente|recorrencia|mensalmente|mensais?|diariamente|semanalmente|anualmente)\b\s*/gi, '')
      .replace(/\b(todo\s*mes|toda\s*semana|todo\s*ano|todos\s*os\s*dias|todo\s*dia(?!\s*\w))\b\s*/gi, '')
      .replace(/\btoda?\s*(segunda|terca|quarta|quinta|sexta|sabado|domingo)(-feira)?\b\s*/gi, '')
      .replace(/\bde\s+segunda\s+a\s+sexta\b\s*/gi, '')
      // 5. Remover dia/hora/data
      .replace(/\btodo\s*(?:mes\s*)?dia\s*\d{1,2}\b\s*/gi, '')
      .replace(/\bdia\s*\d{1,2}\b\s*/gi, '')
      .replace(/\b\d{1,2}\s*h(\d{2})?\b\s*/gi, '')
      .replace(/\b\d{1,2}:\d{2}\b\s*/gi, '')
      .replace(/\b(as|às)\s*\d{1,2}(:\d{2})?\s*(h|horas?)?\b\s*/gi, '')
      .replace(/\b\d+\s*(horas?|minutos?)\b\s*/gi, '')
      // 6. Remover valor monetário completamente
      .replace(/r\$\s*[\d.,]+/gi, '')
      .replace(/\b[\d.,]+\s*(reais?|real|centavos?)\b/gi, '')
      .replace(/\b(novecentos|oitocentos|setecentos|seiscentos|quinhentos|quatrocentos|trezentos|duzentos|cem|mil)\b\s*(reais?)?/gi, '')
      .replace(/\br\b\s*/gi, '')  // resíduo de "r$"
      // 7. Remover artigos/preposições soltas no início
      .replace(/^(para|pra|pro|de|do|da|o|a|um|uma|e|com|no|na)\s+/gi, '')
      .replace(/^(para|pra|pro|de|do|da|o|a|um|uma|e|com|no|na)\s+/gi, '')
      // 8. Remover números soltos
      .replace(/\b\d+\b\s*/g, '')
      // 9. Remover pontuação e espaços extras
      .replace(/[,.:;!?]+/g, ' ')
      .replace(/\s{2,}/g, ' ').trim() || null;
  }

  return { intencao, valor, categoria, normalizado, original: txt, textoLembrete, recorrente };
}

// ── 8. TESTES ─────────────────────────────────────────────────────────────────
function testar() {
  const casos = [
    { txt: '50 gasolina',                   esp: { intencao:'saida',        valor:50,    categoria:'combustivel' } },
    { txt: 'gastei 20 almoco',              esp: { intencao:'saida',        valor:20,    categoria:'alimentacao' } },
    { txt: 'combustivel 50',                esp: { intencao:'saida',        valor:50,    categoria:'combustivel' } },
    { txt: 'conjstivel 50',                 esp: { intencao:'saida',        valor:50,    categoria:'combustivel' } },
    { txt: 'combutivel 30',                 esp: { intencao:'saida',        valor:30,    categoria:'combustivel' } },
    { txt: 'cobrei 150 da maria',           esp: { intencao:'entrada',      valor:150                           } },
    { txt: 'recebi 90',                     esp: { intencao:'entrada',      valor:90                            } },
    { txt: 'todo dia 10 aluguel',           esp: { intencao:'recorrente',   valor:null,  categoria:'aluguel'    } },
    { txt: 'toda segunda academia',         esp: { intencao:'recorrente'                                        } },
    { txt: '1.200,00 fornecedor',           esp: { intencao:'saida',        valor:1200,  categoria:'produtos'   } },
    { txt: 'mercado amanha',                esp: { intencao:'lembrete'                                          } },
    { txt: '10,47 refeicao',                esp: { intencao:'saida',        valor:10.47, categoria:'alimentacao'} },
    { txt: 'fornecedor 300',                esp: { intencao:'saida',        valor:300,   categoria:'produtos'   } },
    { txt: 'luz 150',                       esp: { intencao:'saida',        valor:150,   categoria:'energia'    } },
  ];
  let ok=0, fail=0;
  for (const c of casos) {
    const r = parsear(c.txt);
    const passou = r.intencao === c.esp.intencao &&
      (c.esp.valor === undefined || r.valor === c.esp.valor) &&
      (c.esp.categoria === undefined || r.categoria === c.esp.categoria);
    console.log(passou?'✅':'❌', `"${c.txt}" → intencao:${r.intencao} valor:${r.valor} cat:${r.categoria}`);
    if (!passou) { console.log('   esperado:', c.esp); fail++; } else ok++;
  }
  console.log(`\n${ok} passaram, ${fail} falharam`);
}

module.exports = { parsear, normalizar, extrairValor, extrairCategoria, detectarIntencao, detectarRecorrente, testar };
