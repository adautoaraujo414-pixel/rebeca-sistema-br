import {
  ShoppingCart, DollarSign, Package,
  AlertTriangle, TrendingUp, Clock,
  Store, RefreshCw,
} from 'lucide-react';
import { useDashboard } from '../shared/hooks/useDashboard';
import { useFormato } from '../shared/hooks/useFormat';
import { SummaryCard }  from '../shared/components/SummaryCard';
import { SkeletonCard } from '../shared/components/SkeletonCard';
import { AlertCard }    from '../shared/components/AlertCard';
import { EmptyState }   from '../shared/components/EmptyState';
import { useAuth }      from '../shared/hooks/useAuth';

// Grid responsivo
const gridStyle = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap:                 'var(--space-4)',
};

function Section({ title, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{
        fontSize:      'var(--text-base)',
        fontWeight:    'var(--weight-semi)',
        color:         'var(--color-text-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { admin }                        = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useDashboard();
  const fmt                              = useFormato();

  const hoje       = data?.hoje;
  const mes        = data?.ultimos30dias;
  const estoque    = data?.estoque;
  const caixa      = data?.caixa;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontSize:   'var(--text-xl)',
            fontWeight: 'var(--weight-bold)',
            color:      'var(--color-text)',
            marginBottom: 'var(--space-1)',
          }}>
            Olá, {admin?.nome?.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--color-text-2)', fontSize: 'var(--text-base)' }}>
            {new Date().toLocaleDateString('pt-BR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            padding:      'var(--space-2) var(--space-3)',
            background:   'transparent',
            border:       '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color:        'var(--color-text-2)',
            cursor:       isFetching ? 'not-allowed' : 'pointer',
            fontSize:     'var(--text-sm)',
            transition:   'all var(--transition-fast)',
            opacity:      isFetching ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} style={{
            animation: isFetching ? 'spin 1s linear infinite' : 'none',
          }} />
          Atualizar
        </button>
      </div>

      {/* Erro */}
      {isError && (
        <AlertCard
          tipo="error"
          titulo="Erro ao carregar dados"
          descricao="Verifique sua conexão e tente novamente."
        />
      )}

      {/* Caixa aberto */}
      {!isLoading && caixa?.aberto && (
        <AlertCard
          tipo="success"
          titulo={`Caixa aberto — operador: ${caixa.operador}`}
          descricao={`${fmt.moeda(caixa.totalVendas)} em ${caixa.qtdVendas} venda(s) neste caixa`}
        />
      )}
      {!isLoading && !caixa?.aberto && !isError && (
        <AlertCard
          tipo="warning"
          titulo="Nenhum caixa aberto"
          descricao="Abra o caixa para registrar vendas."
        />
      )}

      {/* Alertas de estoque */}
      {!isLoading && estoque?.alertaCritico && (
        <AlertCard
          tipo="warning"
          titulo={`${estoque.produtosAbaixoMinimo} produto(s) abaixo do estoque mínimo`}
          descricao="Acesse o módulo de Produtos para verificar."
        />
      )}

      {/* Cards de hoje */}
      <Section title="Hoje">
        <div style={gridStyle}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <SummaryCard
                title="Vendas hoje"
                value={fmt.moeda(hoje?.vendas)}
                subtitle={`${hoje?.qtdVendas ?? 0} transação(ões)`}
                icon={ShoppingCart}
                variant={hoje?.vendas > 0 ? 'success' : 'default'}
                mono
              />
              <SummaryCard
                title="Ticket médio"
                value={hoje?.qtdVendas > 0
                  ? fmt.moeda(hoje.vendas / hoje.qtdVendas)
                  : '—'}
                subtitle="Por venda hoje"
                icon={TrendingUp}
                variant="primary"
                mono
              />
              <SummaryCard
                title="Caixa"
                value={caixa?.aberto ? 'Aberto' : 'Fechado'}
                subtitle={caixa?.aberto
                  ? `Desde ${fmt.hora(caixa.aberturaEm)}`
                  : 'Nenhum caixa ativo'}
                icon={Store}
                variant={caixa?.aberto ? 'success' : 'warning'}
              />
              <SummaryCard
                title="Alertas estoque"
                value={estoque?.produtosAbaixoMinimo ?? 0}
                subtitle="Produtos abaixo do mínimo"
                icon={Package}
                variant={estoque?.alertaCritico ? 'error' : 'default'}
              />
            </>
          )}
        </div>
      </Section>

      {/* Cards dos últimos 30 dias */}
      <Section title="Últimos 30 dias">
        <div style={gridStyle}>
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <SummaryCard
                title="Receita total"
                value={fmt.moeda(mes?.vendas)}
                subtitle={`${mes?.qtdVendas ?? 0} vendas no período`}
                icon={DollarSign}
                variant={mes?.vendas > 0 ? 'success' : 'default'}
                mono
              />
              <SummaryCard
                title="Média diária"
                value={fmt.moeda(mes?.mediaDia)}
                subtitle="Por dia nos últimos 30 dias"
                icon={TrendingUp}
                variant="primary"
                mono
              />
            </>
          )}
        </div>
      </Section>

      {/* Empty state se sem dados e sem erro */}
      {!isLoading && !isError && hoje?.qtdVendas === 0 && mes?.qtdVendas === 0 && (
        <Section title="">
          <EmptyState
            icon={ShoppingCart}
            titulo="Nenhuma venda registrada ainda"
            descricao="Abra o caixa e registre sua primeira venda para ver os dados aqui."
          />
        </Section>
      )}

    </div>
  );
}
