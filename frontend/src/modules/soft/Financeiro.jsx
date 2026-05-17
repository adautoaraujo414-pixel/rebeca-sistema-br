import { useState } from 'react';
import { RefreshCw, BarChart2 } from 'lucide-react';
import { useOperacional, useFluxo, useFormasPagamento } from '../../shared/hooks/useFinanceiro';
import { useFormato } from '../../shared/hooks/useFormat';
import { FinancialFilters }      from './financeiro/FinancialFilters';
import { FinancialSummary }      from './financeiro/FinancialSummary';
import { RevenueChart }          from './financeiro/RevenueChart';
import { PaymentMethodsChart }   from './financeiro/PaymentMethodsChart';

export default function Financeiro() {
  const [periodo, setPeriodo] = useState('30dias');
  const fmt = useFormato();

  const filtros = { periodo };

  const { data: operacional, isLoading: loadOp, refetch: refOp, isFetching: fetchOp } = useOperacional(filtros);
  const { data: fluxo,       isLoading: loadFl, refetch: refFl }                       = useFluxo(filtros);
  const { data: formas,      isLoading: loadFo }                                        = useFormasPagamento(filtros);

  function refetchAll() { refOp(); refFl(); }
  const fetching = fetchOp;

  // DRE simplificado
  const dre = [
    { label: 'Receita bruta',   valor: operacional?.receita,  cor: 'var(--color-success)' },
    { label: 'Custo produtos',  valor: operacional?.custos,   cor: 'var(--color-error)',   neg: true },
    { label: 'Lucro bruto',     valor: operacional?.lucro,    cor: 'var(--color-primary)', bold: true },
    { label: 'Margem',          valor: null, margem: operacional?.margem },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BarChart2 size={22} color="var(--color-primary)" />
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>Financeiro</h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>Visão operacional do negócio</p>
          </div>
        </div>
        <button onClick={refetchAll} disabled={fetching} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'transparent', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', color: 'var(--color-text-2)',
          cursor: fetching ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)', opacity: fetching ? 0.5 : 1,
        }}>
          <RefreshCw size={14} style={{ animation: fetching ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Filtros período */}
      <FinancialFilters periodo={periodo} onChange={p => setPeriodo(p)} />

      {/* Cards resumo */}
      <FinancialSummary dados={operacional} loading={loadOp} />

      {/* Gráfico fluxo + DRE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* Fluxo de receita */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)', marginBottom: 'var(--space-4)' }}>
            Fluxo de receita
          </div>
          <RevenueChart dados={fluxo} loading={loadFl} />
        </div>

        {/* DRE simplificado */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)', marginBottom: 'var(--space-4)' }}>
            DRE simplificado
          </div>
          {loadOp ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[1,2,3,4].map(i => <div key={i} style={{ height: 36, borderRadius: 'var(--radius-sm)', backgroundImage: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {dre.map((row, i) => (
                <div key={i}>
                  {row.margem !== undefined ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3)', marginTop: 'var(--space-2)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>Margem líquida</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-primary)' }}>
                        {(row.margem ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) var(--space-3)', borderBottom: i < dre.length - 2 ? '1px solid var(--color-border)' : 'none' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)', fontWeight: row.bold ? 'var(--weight-semi)' : 'var(--weight-normal)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: row.bold ? 'var(--text-md)' : 'var(--text-base)', fontWeight: row.bold ? 'var(--weight-bold)' : 'var(--weight-normal)', color: row.cor }}>
                        {row.neg ? '− ' : ''}{fmt.moeda(row.valor ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Formas de pagamento */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semi)', color: 'var(--color-text)', marginBottom: 'var(--space-4)' }}>
          Vendas por forma de pagamento
        </div>
        <PaymentMethodsChart dados={formas} loading={loadFo} />
      </div>

    </div>
  );
}
