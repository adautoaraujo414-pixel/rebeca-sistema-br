/**
 * IMPRESSORA SERVICE — Confort
 * Gera HTML de cupom para impressão em 3 vias (browser print / thermal)
 * Compatível com impressoras térmicas 80mm e jato de tinta
 */

const ImpressoraService = {

    // Gera cupom HTML para impressão
    gerarCupomHTML(pedido, config = {}, via = 1) {
        const nomeRest = config.nomeRestaurante || 'Restaurante';
        const enderecoRest = config.endereco || '';
        const tel = config.telefone || '';
        const dt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        
        const viaLabel = via === 1 ? 'VIA COZINHA' : via === 2 ? 'VIA CLIENTE' : 'VIA CAIXA';
        
        const itens = (pedido.itens || []).map(item => {
            let linha = `<tr>
                <td style="padding:2px 0">${item.qty || item.quantidade || 1}x ${item.nome}</td>
                <td style="text-align:right;padding:2px 0">R$ ${((item.preco || 0) * (item.qty || item.quantidade || 1)).toFixed(2).replace('.',',')}</td>
            </tr>`;
            if (item.adicionais && item.adicionais.length) {
                item.adicionais.forEach(ad => {
                    linha += `<tr><td style="padding:0 0 0 12px;color:#555;font-size:11px">+ ${ad.nome}</td><td style="text-align:right;font-size:11px">R$ ${(ad.preco||0).toFixed(2).replace('.',',')}</td></tr>`;
                });
            }
            if (item.observacao) {
                linha += `<tr><td colspan="2" style="font-size:11px;color:#555;padding:0 0 2px 12px">obs: ${item.observacao}</td></tr>`;
            }
            return linha;
        }).join('');

        const subtotal = pedido.subtotal || pedido.total || 0;
        const taxaEntrega = pedido.taxaEntrega || 0;
        const total = pedido.total || subtotal;
        const troco = pedido.troco || (pedido.valorPago ? pedido.valorPago - total : 0);

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size:13px; width:80mm; padding:4mm; }
  .centro { text-align:center; }
  .linha { border-top:1px dashed #000; margin:6px 0; }
  .negrito { font-weight:bold; }
  .grande { font-size:15px; }
  table { width:100%; border-collapse:collapse; }
  @media print {
    body { width:80mm; }
    .no-print { display:none; }
  }
</style>
</head>
<body>
  <div class="centro negrito grande">${nomeRest}</div>
  ${enderecoRest ? `<div class="centro" style="font-size:11px">${enderecoRest}</div>` : ''}
  ${tel ? `<div class="centro" style="font-size:11px">Tel: ${tel}</div>` : ''}
  <div class="linha"></div>
  <div class="centro negrito">[ ${viaLabel} ]</div>
  <div style="font-size:11px">Data: ${dt}</div>
  <div style="font-size:11px">Pedido #${pedido.numeroPedido || pedido._id?.toString().slice(-6).toUpperCase() || '---'}</div>
  ${pedido.nomeCliente ? `<div style="font-size:11px">Cliente: ${pedido.nomeCliente}</div>` : ''}
  ${pedido.telefoneCliente ? `<div style="font-size:11px">Tel: ${pedido.telefoneCliente}</div>` : ''}
  ${pedido.endereco ? `<div style="font-size:11px">Endereço: ${pedido.endereco}</div>` : ''}
  ${pedido.origemPedido ? `<div style="font-size:11px">Origem: ${pedido.origemPedido.toUpperCase()}</div>` : ''}
  <div class="linha"></div>
  <div class="negrito">ITENS:</div>
  <table>${itens}</table>
  <div class="linha"></div>
  ${taxaEntrega > 0 ? `<table><tr><td>Subtotal</td><td style="text-align:right">R$ ${subtotal.toFixed(2).replace('.',',')}</td></tr><tr><td>Taxa entrega</td><td style="text-align:right">R$ ${taxaEntrega.toFixed(2).replace('.',',')}</td></tr></table>` : ''}
  <div class="negrito grande centro" style="margin:4px 0">TOTAL: R$ ${total.toFixed(2).replace('.',',')}</div>
  ${pedido.formaPagamento ? `<div class="centro">Pagamento: ${pedido.formaPagamento.toUpperCase()}</div>` : ''}
  ${pedido.valorPago ? `<div class="centro">Valor pago: R$ ${pedido.valorPago.toFixed(2).replace('.',',')}</div>` : ''}
  ${troco > 0 ? `<div class="centro negrito">TROCO: R$ ${troco.toFixed(2).replace('.',',')}</div>` : ''}
  ${pedido.observacoes ? `<div class="linha"></div><div style="font-size:11px">OBS: ${pedido.observacoes}</div>` : ''}
  <div class="linha"></div>
  <div class="centro" style="font-size:11px">Obrigado pela preferência!</div>
  <div class="centro" style="font-size:10px">Rebeca Sistema</div>
  <br><br><br>
</body>
</html>`;
    },

    // Gera as 3 vias concatenadas para imprimir de uma vez
    gerarTresVias(pedido, config = {}) {
        return [1, 2, 3].map(via => this.gerarCupomHTML(pedido, config, via)).join(
            '<div style="page-break-after:always"></div>'
        );
    }
};

module.exports = ImpressoraService;
