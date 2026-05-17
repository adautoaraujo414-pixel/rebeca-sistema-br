import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CORES = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
const LABELS = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito', fiado: 'Fiado' };

export function PaymentMethodsChart({ dados, loading }) {
  const data = useMemo(() =>
    (dados ?? []).map(d => ({ ...d, name: LABELS[d._id] || d._id })),
  [dados]);

  if (loading) return (
    <div style={{ height: 200, borderRadius: 'var(--radius-md)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
  );

  if (!data.length) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)', fontSize: 'var(--text-sm)' }}>
      Sem vendas no período
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `R$ ${v.toFixed(2).replace('.', ',')}`} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--color-text-2)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
