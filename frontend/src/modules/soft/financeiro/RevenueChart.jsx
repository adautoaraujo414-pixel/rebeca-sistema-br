import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
      <div style={{ color: 'var(--color-text-2)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semi)' }}>
          R$ {(p.value ?? 0).toFixed(2).replace('.', ',')}
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ dados, loading }) {
  const data = useMemo(() => dados ?? [], [dados]);

  if (loading) return (
    <div style={{ height: 220, borderRadius: 'var(--radius-md)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
  );

  if (!data.length) return (
    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)', fontSize: 'var(--text-sm)' }}>
      Sem dados no período
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-receita" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-3)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-3)' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} width={60} />
        <Tooltip content={<TooltipCustom />} />
        <Area type="monotone" dataKey="receita" stroke="#6366f1" strokeWidth={2} fill="url(#grad-receita)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
