import { useState, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Package, RefreshCw } from 'lucide-react';
import {
  useProdutos, useCategorias,
  useCriarProduto, useAtualizarProduto, useRemoverProduto,
} from '../../shared/hooks/useProdutos';
import { useFormato }   from '../../shared/hooks/useFormat';
import { useToast }     from '../../shared/hooks/useToast';
import { StockBadge }  from '../../shared/components/StockBadge';
import { EmptyState }  from '../../shared/components/EmptyState';
import { Drawer }      from '../../shared/components/Drawer';
import { Toast }       from '../../shared/components/Toast';
import { ProductForm } from './produtos/ProductForm';

const LIMITE = 20;

export default function Produtos() {
  const fmt = useFormato();
  const { toast, mostrar, fechar } = useToast();

  const [busca,     setBusca]     = useState('');
  const [categoria, setCategoria] = useState('');
  const [pagina,    setPagina]    = useState(1);
  const debounceRef = useRef(null);

  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [editando,    setEditando]    = useState(null);
  const [confirmando, setConfirmando] = useState(null);

  const filtros = { busca, categoria, pagina, limite: LIMITE };
  const { data, isLoading, isError, refetch, isFetching } = useProdutos(filtros);
  const { data: categorias = [] } = useCategorias();

  const criar     = useCriarProduto();
  const atualizar = useAtualizarProduto();
  const remover   = useRemoverProduto();

  const produtos = data?.dados || [];
  const meta     = data?.meta  || {};

  const handleBusca = useCallback((v) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setBusca(v); setPagina(1); }, 350);
  }, []);

  function abrirCriar()  { setEditando(null); setDrawerOpen(true); }
  function abrirEditar(p){ setEditando(p);    setDrawerOpen(true); }
  function fecharDrawer() { setDrawerOpen(false); setEditando(null); }

  async function salvar(dados) {
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando._id, dados });
        mostrar('Produto atualizado!');
      } else {
        await criar.mutateAsync(dados);
        mostrar('Produto criado!');
      }
      fecharDrawer();
    } catch (err) {
      mostrar(err.response?.data?.mensagem || 'Erro ao salvar', 'error');
    }
  }

  async function confirmarRemover(id) {
    try {
      await remover.mutateAsync(id);
      mostrar('Produto removido.');
      setConfirmando(null);
    } catch {
      mostrar('Erro ao remover.', 'error');
    }
  }

  const salvando = criar.isPending || atualizar.isPending;

  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'transparent', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--color-text-2)',
    cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>
            Produtos
          </h1>
          <p style={{ color: 'var(--color-text-2)', fontSize: 'var(--text-sm)' }}>
            {meta.total ?? '—'} cadastrado(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button onClick={() => refetch()} disabled={isFetching} style={{ ...btnStyle, opacity: isFetching ? 0.5 : 1 }}>
            <RefreshCw size={14} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button onClick={abrirCriar} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-primary)', border: 'none',
            borderRadius: 'var(--radius-md)', color: '#fff',
            cursor: 'pointer', fontSize: 'var(--text-base)',
            fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-sans)',
          }}>
            <Plus size={16} /> Novo produto
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
          <input placeholder="Buscar produto..."
            onChange={e => handleBusca(e.target.value)}
            style={{
              width: '100%', height: 'var(--input-height)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              paddingLeft: 36, paddingRight: 'var(--space-3)',
              color: 'var(--color-text)', fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e  => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>
        <select value={categoria}
          onChange={e => { setCategoria(e.target.value); setPagina(1); }}
          style={{
            height: 'var(--input-height)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0 var(--space-3)',
            color: 'var(--color-text)', fontSize: 'var(--text-base)',
            fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer', minWidth: 160,
          }}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
        </select>
      </div>

      {isError && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>
          Erro ao carregar produtos.
        </div>
      )}

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 130px 72px', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Produto</span>
          <span style={{ textAlign: 'right' }}>Preço</span>
          <span style={{ textAlign: 'center' }}>Estoque</span>
          <span>Categoria</span>
          <span style={{ textAlign: 'right' }}>Ações</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 'var(--radius-sm)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        ) : produtos.length === 0 ? (
          <EmptyState icon={Package} titulo="Nenhum produto encontrado" descricao={busca ? 'Tente outro termo.' : 'Clique em "Novo produto" para começar.'} />
        ) : (
          produtos.map((p, i) => (
            <div key={p._id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 130px 72px', padding: 'var(--space-3) var(--space-5)', borderBottom: i < produtos.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center', transition: 'background var(--transition-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>{p.nome}</div>
                {p.descricao && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{p.descricao}</div>}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{fmt.moeda(p.preco)}</div>
              <div style={{ textAlign: 'center' }}><StockBadge estoque={p.estoque ?? 0} estoqueMin={p.estoqueMinimo} /></div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>{p.categoriaNome || '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                <button onClick={() => abrirEditar(p)} className="btn-icon" title="Editar"><Edit2 size={14} /></button>
                <button onClick={() => setConfirmando(p._id)} className="btn-icon" title="Remover"><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {meta.totalPaginas > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)' }}>
          {Array.from({ length: meta.totalPaginas }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPagina(p)} style={{ width: 36, height: 36, background: p === pagina ? 'var(--color-primary)' : 'transparent', border: `1px solid ${p === pagina ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', color: p === pagina ? '#fff' : 'var(--color-text-2)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)' }}>{p}</button>
          ))}
        </div>
      )}

      {confirmando && (
        <>
          <div onClick={() => setConfirmando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', zIndex: 201, width: '100%', maxWidth: 360, animation: 'slideIn 200ms ease' }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>Remover produto?</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 'var(--space-5)' }}>O produto será desativado. Pode ser revertido.</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmando(null)} style={{ ...btnStyle }}>Cancelar</button>
              <button onClick={() => confirmarRemover(confirmando)} disabled={remover.isPending} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--color-error)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', opacity: remover.isPending ? 0.7 : 1 }}>
                {remover.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </>
      )}

      <Drawer open={drawerOpen} onClose={fecharDrawer} title={editando ? 'Editar produto' : 'Novo produto'}>
        <ProductForm inicial={editando} onSalvar={salvar} salvando={salvando} />
      </Drawer>

      {toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} onClose={fechar} />}
    </div>
  );
}
