python3 << 'PYEOF'
import os

base = '/workspaces/rebeca-sistema-br/src/public'
for root, dirs, files in os.walk(base):
    for f in files:
        print(os.path.join(root, f))
PYEOF
import { useState, useEffect } from 'react';

const EMPTY = { nome: '', descricao: '', ativo: true };

export function CategoryForm({ inicial, onSalvar, salvando }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    setForm(inicial
      ? { nome: inicial.nome || '', descricao: inicial.descricao || '', ativo: inicial.ativo ?? true }
      : EMPTY
    );
  }, [inicial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const inp = {
    width: '100%', height: 'var(--input-height)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-3)',
    color: 'var(--color-text)',
    fontSize: 'var(--text-base)',
    fontFamily: 'var(--font-sans)',
    outline: 'none', boxSizing: 'border-box',
  };
  const lbl = {
    fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-2)', display: 'block', marginBottom: 'var(--space-2)',
  };
  const fo = e => e.target.style.borderColor = 'var(--color-primary)';
  const bl = e => e.target.style.borderColor = 'var(--color-border)';

  return (
    <form onSubmit={e => { e.preventDefault(); onSalvar({ nome: form.nome.trim(), descricao: form.descricao.trim() || undefined, ativo: form.ativo }); }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={lbl}>Nome *</label>
        <input style={inp} value={form.nome}
          onChange={e => set('nome', e.target.value)}
          onFocus={fo} onBlur={bl}
          placeholder="Nome da categoria" required maxLength={80} />
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={lbl}>Descrição</label>
        <textarea style={{ ...inp, height: 80, padding: 'var(--space-2) var(--space-3)', resize: 'vertical' }}
          value={form.descricao} onChange={e => set('descricao', e.target.value)}
          onFocus={fo} onBlur={bl} placeholder="Opcional" maxLength={300} />
      </div>

      {inicial && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <input type="checkbox" id="cat-ativo" checked={form.ativo}
            onChange={e => set('ativo', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="cat-ativo" style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}>
            Categoria ativa
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
        {salvando ? 'Salvando...' : (inicial ? 'Salvar alterações' : 'Criar categoria')}
      </button>
    </form>
  );
}
