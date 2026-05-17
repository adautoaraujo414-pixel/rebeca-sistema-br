import { useState, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Tag, RefreshCw } from 'lucide-react';
import {
  useCategoriasAdmin, useCriarCategoria,
  useAtualizarCategoria, useRemoverCategoria,
} from '../shared/hooks/useCategoriasCrud';
import { useToast }    from '../shared/hooks/useToast';
import { EmptyState }  from '../shared/components/EmptyState';
import { Drawer }      from '../shared/components/Drawer';
import { Toast }       from '../shared/components/Toast';
import { CategoryForm } from './categorias/CategoryForm';

export default function Categorias() {
  const { toast, mostrar, fechar } = useToast();

  const [busca,     setBusca]     = useState('');
  const [pagina,    setPagina]    = useState(1);
  const debounceRef = useRef(null);

  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [editando,    setEditando]    = useState(null);
  const [confirmando, setConfirmando] = useState(null);

  const { data, isLoading, isError, refetch, isFetching } =
    useCategoriasAdmin({ busca, pagina, limite: 20 });

  const criar     = useCriarCategoria();
  const atualizar = useAtualizarCategoria();
  const remover   = useRemoverCategoria();

  const categorias = data?.dados || [];
  const meta       = data?.meta  || {};

  const handleBusca = useCallback((v) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setBusca(v); setPagina(1); }, 350);
  }, []);

  function abrirCriar()   { setEditando(null); setDrawerOpen(true); }
  function abrirEditar(c) { setEditando(c);    setDrawerOpen(true); }
  function fecharDrawer() { setDrawerOpen(false); setEditando(null); }

  async function salvar(dados) {
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando._id, dados });
        mostrar('Categoria atualizada!');
      } else {
        await criar.mutateAsync(dados);
        mostrar('Categoria criada!');
      }
      fecharDrawer();
    } catch (err) {
      mostrar(err.response?.data?.mensagem || 'Erro ao salvar', 'error');
    }
  }

  async function confirmarRemover(id) {
    try {
      await remover.mutateAsync(id);
      mostrar('Categoria removida.');
      setConfirmando(null);
    } catch {
      mostrar('Erro ao remover.', 'error');
    }
  }

  const salvando = criar.isPending || atualizar.isPending;

  const btnSecStyle = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'transparent', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--color-text-2)',
    cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>
            Categorias
          </h1>
          <p style={{ color: 'var(--color-text-2)', fontSize: 'var(--text-sm)' }}>
            {meta.total ?? '—'} cadastrada(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button onClick={() => refetch()} disabled={isFetching} style={{ ...btnSecStyle, opacity: isFetching ? 0.5 : 1 }}>
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
            <Plus size={16} /> Nova categoria
          </button>
        </div>
      </div>

      {/* Busca */}
      <div style={{ position: 'relative', maxWidth: 400 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
        <input placeholder="Buscar categoria..."
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

      {isError && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>
          Erro ao carregar categorias.
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 80px 72px', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Nome</span>
          <span>Descrição</span>
          <span style={{ textAlign: 'center' }}>Status</span>
          <span style={{ textAlign: 'right' }}>Ações</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 'var(--radius-sm)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        ) : categorias.length === 0 ? (
          <EmptyState icon={Tag} titulo="Nenhuma categoria encontrada" descricao={busca ? 'Tente outro termo.' : 'Clique em "Nova categoria" para começar.'} />
        ) : (
          categorias.map((c, i) => (
            <div key={c._id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 80px 72px', padding: 'var(--space-3) var(--space-5)', borderBottom: i < categorias.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center', transition: 'background var(--transition-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>{c.nome}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descricao || '—'}</div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', background: c.ativo ? 'var(--color-success-bg)' : 'var(--color-border)', color: c.ativo ? 'var(--color-success)' : 'var(--color-text-3)' }}>
                  {c.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                <button onClick={() => abrirEditar(c)} className="btn-icon" title="Editar"><Edit2 size={14} /></button>
                <button onClick={() => setConfirmando(c._id)} className="btn-icon" title="Remover"><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginação */}
      {meta.totalPaginas > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)' }}>
          {Array.from({ length: meta.totalPaginas }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPagina(p)} style={{ width: 36, height: 36, background: p === pagina ? 'var(--color-primary)' : 'transparent', border: `1px solid ${p === pagina ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', color: p === pagina ? '#fff' : 'var(--color-text-2)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)' }}>{p}</button>
          ))}
        </div>
      )}

      {/* Confirmação exclusão */}
      {confirmando && (
        <>
          <div onClick={() => setConfirmando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', zIndex: 201, width: '100%', maxWidth: 360, animation: 'slideIn 200ms ease' }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>Remover categoria?</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', marginBottom: 'var(--space-5)' }}>A categoria será desativada.</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmando(null)} style={{ ...btnSecStyle }}>Cancelar</button>
              <button onClick={() => confirmarRemover(confirmando)} disabled={remover.isPending} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--color-error)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', opacity: remover.isPending ? 0.7 : 1 }}>
                {remover.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </>
      )}

      <Drawer open={drawerOpen} onClose={fecharDrawer} title={editando ? 'Editar categoria' : 'Nova categoria'}>
        <CategoryForm inicial={editando} onSalvar={salvar} salvando={salvando} />
      </Drawer>

      {toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} onClose={fechar} />}
    </div>
  );
}
