const ComandaService = {

    gerarTexto(pedido, config = {}) {
        const { nomeEstab = 'Delivery', vias = 1 } = config;
        const R   = (n) => `R$ ${(n||0).toFixed(2).replace('.',',')}`;
        const DIV = '--------------------------------';
        const L   = [];
        L.push(nomeEstab.toUpperCase()); L.push(DIV);
        L.push(`Pedido #${pedido.numeroPedido||'---'}`);
        L.push(new Date().toLocaleString('pt-BR',{ timeZone:'America/Sao_Paulo' }));
        if (pedido.operador)    L.push(`Operador: ${pedido.operador}`);
        if (pedido.mesa)        L.push(`Mesa: ${pedido.mesa}`);
        if (pedido.clienteNome) L.push(`Cliente: ${pedido.clienteNome}`);
        L.push(DIV);
        for (const item of (pedido.itens||[])) {
            L.push(`${item.quantidade}x ${item.nome}`);
            if (item.personalizacao) L.push(`   -> ${item.personalizacao}`);
            L.push(`   ${R((item.preco||0)*(item.quantidade||1))}`);
        }
        L.push(DIV);
        const sub = pedido.total||0, garc = pedido.taxaGarcom||0, banda = pedido.taxaBanda||0;
        L.push(DIV);
        L.push('ITENS:');
        for (const item of (pedido.itens||[])) {
            L.push(`  ${item.quantidade}x ${item.nome}: ${R((item.preco||0)*(item.quantidade||1))}`);
        }
        L.push(DIV);
        L.push(`Subtotal:    ${R(sub)}`);
        if (garc  > 0) L.push(`Taxa garcom: ${R(garc)} (${pedido.taxaGarcomPerc||10}%)`);
        if (banda > 0) L.push(`Banda/Cover: ${R(banda)}`);
        L.push(`TOTAL:       ${R(sub+garc+banda)}`);
        L.push(`Pagamento:   ${pedido.formaPagamento||'pendente'}`);
        if (pedido.enderecoEntrega) { L.push(DIV); L.push(`Entrega: ${pedido.enderecoEntrega}`); }
        L.push(DIV); L.push(''); L.push('');
        const base = L.join('\n');
        const viasArr = [];
        for (let i = 0; i < vias; i++) {
            viasArr.push((vias > 1 ? `VIA ${i+1}/${vias}\n${DIV}\n` : '') + base);
        }
        return viasArr.join('\n\n=' + DIV + '\n\n');
    },

    gerarHTML(pedido, config = {}) {
        const texto = this.gerarTexto(pedido, config);
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:12px;width:280px;margin:0 auto}pre{white-space:pre-wrap}</style></head><body><pre>${texto.replace(/</g,'&lt;')}</pre><script>window.onload=function(){window.print();}<\/script></body></html>`;
    },
};

module.exports = ComandaService;
