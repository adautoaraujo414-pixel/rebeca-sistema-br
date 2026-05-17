import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';

function Card({ icon: Icon, label, valor, cor, bg, loading }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={cor} />
        </div>
      </div>
      {loading ? (
        <div style={{ height: 32, borderRadius: 'var(--radius-sm)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 'var(--weight-bold)', color: 'var(--color-text)', lineHeight: 1 }}>
          {valor}
        </div>
      )}
    </div>
  );
}

export function FinancialSummary({ dados, loading }) {
  const fmt = (v) => `R$ ${(v ?? 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
      <Card icon={DollarSign} label="Receita"   valor={fmt(dados?.receita)}   cor="var(--color-success)" bg="var(--color-success-bg)" loading={loading} />
      <Card icon={TrendingDown} label="Despesas" valor={fmt(dados?.despesas)}  cor="var(--color-error)"   bg="var(--color-error-bg)"   loading={loading} />
      <Card icon={TrendingUp}  label="Lucro"    valor={fmt(dados?.lucro)}     cor="var(--color-primary)" bg="var(--color-primary-bg)" loading={loading} />
      <Card icon={Percent}     label="Margem"   valor={`${(dados?.margem ?? 0).toFixed(1)}%`} cor="var(--color-warning)" bg="var(--color-warning-bg)" loading={loading} />
    </div>
  );
}
