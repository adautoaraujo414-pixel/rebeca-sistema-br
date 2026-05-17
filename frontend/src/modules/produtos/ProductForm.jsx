import { useState, useEffect } from 'react';
import { useCategorias } from '../../shared/hooks/useProdutos';

const EMPTY = {
  nome: '', descricao: '', preco: '', precoCusto: '',
  estoque: '', estoqueMinimo: '', categoriaId: '', ativo: true,
};

export function ProductForm({ inicial, onSalvar, salvando }) {
  const [form, setForm] = useState(EMPTY);
  const { data: categorias = [] } = useCategorias();

  useEffect(() => {
    if (inicial) {
      setForm({
        nome:          inicial.nome || '',
        descricao:     inicial.descricao || '',
        preco:         inicial.preco ?? '',
        precoCusto:    inicial.precoCusto ?? '',
        estoque:       inicial.estoque ?? '',
        estoqueMinimo: inicial.estoqueMinimo ?? '',
        categoriaId:   inicial.categoriaId?._id || inicial.categoriaId || '',
        ativo:         inicial.ativo ?? true,
      });
    } else {
      setForm(EMPTY);
    }
  }, [inicial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    onSalvar({
      nome:          form.nome.trim(),
      descricao:     form.descricao.trim() || undefined,
      preco:         parseFloat(form.preco),
      precoCusto:    form.precoCusto !== '' ? parseFloat(form.precoCusto) : undefined,
      estoque:       form.estoque !== '' ? parseInt(form.estoque, 10) : undefined,
      estoqueMinimo: form.estoqueMinimo !== '' ? parseInt(form.estoqueMinimo, 10) : undefined,
      categoriaId:   form.categoriaId || undefined,
      ativo:         form.ativo,
    });
  }

  const inp = {
    width: '100%', height: 'var(--input-height)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-3)',
    color: 'var(--color-text)',
    fontSize: 'var(--text-base)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const lbl = {
    fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-2)', display: 'block', marginBottom: 'var(--space-2)',
  };
  const fld = { display: 'flex', flexDirection: 'column', marginBottom: 'var(--space-4)' };
  const fo = e => e.target.style.borderColor = 'var(--color-primary)';
  const bl = e => e.target.style.borderColor = 'var(--color-border)';

  return (
    <form onSubmit={handleSubmit}>
      <div style={fld}>
        <label style={lbl}>Nome *</label>
        <input style={inp} value={form.nome}
          onChange={e => set('nome', e.target.value)}
          onFocus={fo} onBlur={bl}
          placeholder="Nome do produto" required maxLength={120} />
      </div>

      <div style={fld}>
        <label style={lbl}>Categoria</label>
        <select style={{ ...inp, cursor: 'pointer' }}
          value={form.categoriaId}
          onChange={e => set('categoriaId', e.target.value)}
          onFocus={fo} onBlur={bl}>
          <option value="">Sem categoria</option>
          {categorias.map(c => (
            <option key={c._id} value={c._id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <label style={lbl}>Preço venda *</label>
          <input style={inp} type="number" step="0.01" min="0"
            value={form.preco} onChange={e => set('preco', e.target.value)}
            onFocus={fo} onBlur={bl} placeholder="0,00" required />
        </div>
        <div>
          <label style={lbl}>Custo</label>
          <input style={inp} type="number" step="0.01" min="0"
            value={form.precoCusto} onChange={e => set('precoCusto', e.target.value)}
            onFocus={fo} onBlur={bl} placeholder="0,00" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <label style={lbl}>Estoque</label>
          <input style={inp} type="number" min="0"
            value={form.estoque} onChange={e => set('estoque', e.target.value)}
            onFocus={fo} onBlur={bl} placeholder="0" />
        </div>
        <div>
          <label style={lbl}>Estoque mínimo</label>
          <input style={inp} type="number" min="0"
            value={form.estoqueMinimo} onChange={e => set('estoqueMinimo', e.target.value)}
            onFocus={fo} onBlur={bl} placeholder="5" />
        </div>
      </div>

      <div style={fld}>
        <label style={lbl}>Descrição</label>
        <textarea style={{ ...inp, height: 80, padding: 'var(--space-2) var(--space-3)', resize: 'vertical' }}
          value={form.descricao} onChange={e => set('descricao', e.target.value)}
          onFocus={fo} onBlur={bl} placeholder="Opcional" maxLength={500} />
      </div>

      {inicial && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <input type="checkbox" id="ativo" checked={form.ativo}
            onChange={e => set('ativo', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="ativo" style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}>
            Produto ativo
          </label>
        </div>
      )}

      <button type="submit" disabled={salvando} style={{
        width: '100%', height: 'var(--btn-height-md)',
        background: salvando ? 'var(--color-primary-bg)' : 'var(--color-primary)',
        border: 'none', borderRadius: 'var(--radius-md)',
        color: '#fff', fontSize: 'var(--text-base)',
        fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-sans)',
        cursor: salvando ? 'not-allowed' : 'pointer',
        opacity: salvando ? 0.7 : 1,
      }}>
        {salvando ? 'Salvando...' : (inicial ? 'Salvar alterações' : 'Criar produto')}
      </button>
    </form>
  );
}
