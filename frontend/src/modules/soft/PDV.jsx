import { useState, useCallback, useEffect, useRef } from 'react';
import { Store, Lock, Unlock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePDVStore }    from '../../stores/pdv.store';
import { caixaApi, vendaApi, produtoPDVApi } from '../../services/pdv.api';
import { useToast }       from '../../shared/hooks/useToast';
import { Toast }          from '../../shared/components/Toast';
import { PDVSearchBar }   from './pdv/PDVSearchBar';
import { CartSidebar }    from './pdv/CartSidebar';
import { PaymentModal }   from './pdv/PaymentModal';
import { CaixaModal }     from './pdv/CaixaModal';

export default function PDV() {
  const qc = useQueryClient();
  const { toast, mostrar, fechar } = useToast();
  const { adicionarItem, limpar, setCaixa } = usePDVStore();

  const [busca,       setBusca]       = useState('');
  const [resultados,  setResultados]  = useState([]);
  const [buscando,    setBuscando]    = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [caixaModal,  setCaixaModal]  = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const debounceRef = useRef(null);

  // ✅ Padrão v5 — sem onSuccess/onError no useQuery
  const { data: caixaData, refetch: refetchCaixa } = useQuery({
    queryKey: ['caixa', 'atual'],
    queryFn:  () => caixaApi.atual().catch(() => null),
    retry: false,
    staleTime: 1000 * 30,
  });

  // ✅ Migrado: useEffect observa caixaData
  useEffect(() => {
    setCaixa(caixaData ?? null);
  }, [caixaData, setCaixa]);

  const caixaAberto = caixaData?.aberto ?? false;

  const handleBusca = useCallback((v) => {
    setBusca(v);
    clearTimeout(debounceRef.current);
    if (!v.trim()) { setResultados([]); return; }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await produtoPDVApi.buscar(v);
        setResultados(res);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
  }, []);

  function selecionarProduto(p) {
    if (p.estoque <= 0) { mostrar('Produto sem estoque.', 'error'); return; }
    adicionarItem(p);
    setBusca('');
    setResultados([]);
    document.getElementById('pdv-busca')?.focus();
  }

  const abrirCaixaMut = useMutation({
    mutationFn: (v) => caixaApi.abrir({ saldoInicial: v }),
    onSuccess: () => { refetchCaixa(); setCaixaModal(null); mostrar('Caixa aberto!'); },
    onError:   () => mostrar('Erro ao abrir caixa.', 'error'),
  });

  const fecharCaixaMut = useMutation({
    mutationFn: (v) => caixaApi.fechar({ saldoFinal: v }),
    onSuccess: () => { refetchCaixa(); setCaixaModal(null); mostrar('Caixa fechado.'); },
    onError:   () => mostrar('Erro ao fechar caixa.', 'error'),
  });

  async function finalizarVenda({ formaPagamento, valorRecebido, troco }) {
    const itens = usePDVStore.getState().itens;
    if (!itens.length) return;
    setFinalizando(true);
    try {
      await vendaApi.criar({
        itens: itens.map(i => ({ produtoId: i._id, quantidade: i.qty, precoUnitario: i.preco })),
        formaPagamento, valorRecebido, troco,
      });
      limpar();
      setPaymentOpen(false);
      mostrar('Venda finalizada! ✅');
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['caixa'] });
    } catch (err) {
      mostrar(err.response?.data?.mensagem || 'Erro ao finalizar venda.', 'error');
    } finally {
      setFinalizando(false);
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (paymentOpen || caixaModal) return;
      if (e.key === 'F2') { e.preventDefault(); document.getElementById('pdv-busca')?.focus(); }
      if (e.key === 'F9') { e.preventDefault(); if (caixaAberto && usePDVStore.getState().itens.length) setPaymentOpen(true); }
      if (e.key === 'F4') { e.preventDefault(); setCaixaModal(caixaAberto ? 'fechar' : 'abrir'); }
      if (e.key === 'Backspace' && document.activeElement?.id !== 'pdv-busca') {
        e.preventDefault();
        usePDVStore.getState().removerUltimo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [caixaAberto, paymentOpen, caixaModal]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Store size={22} color="var(--color-primary)" />
          <div>
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>PDV</h1>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>F2 busca · Enter adiciona · F9 finaliza · F4 caixa</p>
          </div>
        </div>
        <button onClick={() => setCaixaModal(caixaAberto ? 'fechar' : 'abrir')} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          background: caixaAberto ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
          border: `1px solid ${caixaAberto ? 'var(--color-success)' : 'var(--color-error)'}`,
          borderRadius: 'var(--radius-md)',
          color: caixaAberto ? 'var(--color-success)' : 'var(--color-error)',
          cursor: 'pointer', fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-medium)',
        }}>
          {caixaAberto ? <Unlock size={15} /> : <Lock size={15} />}
          {caixaAberto ? 'Caixa aberto  F4' : 'Abrir caixa  F4'}
        </button>
      </div>

      {!caixaAberto && (
        <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-warning)', fontSize: 'var(--text-sm)' }}>
          Abra o caixa para registrar vendas. Pressione F4 ou clique no botão acima.
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <PDVSearchBar value={busca} onChange={handleBusca} resultados={resultados} onSelect={selecionarProduto} loading={buscando} />
          {!busca && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-10)', textAlign: 'center', color: 'var(--color-text-3)' }}>
              <Store size={40} strokeWidth={1} style={{ marginBottom: 'var(--space-4)', opacity: 0.4 }} />
              <div style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)' }}>Busque um produto para começar</div>
              <div style={{ fontSize: 'var(--text-sm)' }}>Digite o nome e pressione Enter para adicionar ao carrinho</div>
            </div>
          )}
        </div>
        <CartSidebar onFinalizar={() => setPaymentOpen(true)} caixaAberto={caixaAberto} />
      </div>

      {paymentOpen && (
        <PaymentModal
          total={usePDVStore.getState().total()}
          onConfirmar={finalizarVenda}
          onCancelar={() => setPaymentOpen(false)}
          loading={finalizando}
        />
      )}

      {caixaModal && (
        <CaixaModal
          modo={caixaModal}
          onConfirmar={(v) => caixaModal === 'abrir' ? abrirCaixaMut.mutate(v) : fecharCaixaMut.mutate(v)}
          onCancelar={() => setCaixaModal(null)}
          loading={abrirCaixaMut.isPending || fecharCaixaMut.isPending}
        />
      )}

      {toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} onClose={fechar} />}
    </div>
  );
}
