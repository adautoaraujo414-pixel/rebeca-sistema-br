import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';

const MODULES = [
  {
    id:          'soft',
    nome:        'Rebeca Soft',
    tagline:     'Gestão completa do seu negócio',
    descricao:   'PDV, estoque, financeiro, categorias e relatórios em um só lugar.',
    rota:        '/soft/dashboard',
    status:      'active',
    cor:         '#6366f1',
    glow:        'rgba(99,102,241,0.15)',
    badge:       'Ativo',
    icone:       '🏪',
  },
  {
    id:          'delivery',
    nome:        'Rebeca Delivery',
    tagline:     'Delivery inteligente',
    descricao:   'Gestão de pedidos, cardápio digital, motoboys e rastreamento em tempo real.',
    rota:        '/delivery',
    status:      'coming',
    cor:         '#f59e0b',
    glow:        'rgba(245,158,11,0.15)',
    badge:       'Em breve',
    icone:       '🛵',
  },
  {
    id:          'agenda',
    nome:        'Agenda Rebeca',
    tagline:     'Agendamentos sem esforço',
    descricao:   'Horários, clientes, lembretes automáticos e gestão de serviços.',
    rota:        '/agenda',
    status:      'coming',
    cor:         '#22c55e',
    glow:        'rgba(34,197,94,0.15)',
    badge:       'Em breve',
    icone:       '📅',
  },
  {
    id:          'ia',
    nome:        'Rebeca IA',
    tagline:     'Inteligência no seu negócio',
    descricao:   'Previsão de vendas, sugestões automáticas e insights operacionais.',
    rota:        null,
    status:      'soon',
    cor:         '#8b5cf6',
    glow:        'rgba(139,92,246,0.15)',
    badge:       'Roadmap',
    icone:       '✨',
  },
];

function ProductCard({ mod, onAcessar }) {
  const active  = mod.status === 'active';
  const coming  = mod.status === 'coming';
  const soon    = mod.status === 'soon';

  return (
    <div
      onClick={() => active && onAcessar(mod.rota)}
      style={{
        position:     'relative',
        background:   'var(--color-surface)',
        border:       `1px solid ${active ? mod.cor + '40' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-xl)',
        padding:      'var(--space-6)',
        cursor:       active ? 'pointer' : 'default',
        transition:   'all 0.25s ease',
        opacity:      soon ? 0.6 : 1,
        display:      'flex',
        flexDirection:'column',
        gap:          'var(--space-4)',
      }}
      onMouseEnter={e => {
        if (!soon) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 8px 32px ${mod.glow}`;
          e.currentTarget.style.borderColor = mod.cor + '60';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = active ? mod.cor + '40' : 'var(--color-border)';
      }}
    >
      {/* Badge */}
      <div style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)' }}>
        <span style={{
          fontSize:     'var(--text-xs)',
          fontWeight:   'var(--weight-medium)',
          padding:      '2px 10px',
          borderRadius: 'var(--radius-full)',
          background:   active ? mod.cor + '20' : 'var(--color-surface-2)',
          color:        active ? mod.cor : 'var(--color-text-3)',
          border:       `1px solid ${active ? mod.cor + '40' : 'var(--color-border)'}`,
        }}>
          {mod.badge}
        </span>
      </div>

      {/* Ícone */}
      <div style={{
        width:        48, height: 48,
        borderRadius: 'var(--radius-lg)',
        background:   mod.cor + '15',
        border:       `1px solid ${mod.cor}30`,
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        fontSize:     24,
      }}>
        {mod.icone}
      </div>

      {/* Texto */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize:   'var(--text-md)',
          fontWeight: 'var(--weight-bold)',
          color:      'var(--color-text)',
          marginBottom: 4,
        }}>
          {mod.nome}
        </div>
        <div style={{
          fontSize:     'var(--text-xs)',
          fontWeight:   'var(--weight-medium)',
          color:        mod.cor,
          marginBottom: 'var(--space-2)',
        }}>
          {mod.tagline}
        </div>
        <div style={{
          fontSize:   'var(--text-sm)',
          color:      'var(--color-text-3)',
          lineHeight: 1.5,
        }}>
          {mod.descricao}
        </div>
      </div>

      {/* Botão */}
      <button
        onClick={e => { e.stopPropagation(); active && onAcessar(mod.rota); }}
        disabled={!active}
        style={{
          width:        '100%',
          height:       40,
          background:   active ? mod.cor : 'transparent',
          border:       `1px solid ${active ? mod.cor : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          color:        active ? '#fff' : 'var(--color-text-3)',
          fontSize:     'var(--text-sm)',
          fontWeight:   'var(--weight-medium)',
          fontFamily:   'var(--font-sans)',
          cursor:       active ? 'pointer' : 'not-allowed',
          transition:   'all 0.2s ease',
        }}
      >
        {active ? 'Acessar módulo' : coming ? 'Em breve' : 'No roadmap'}
      </button>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  // Auto-redirect se tiver apenas soft liberado
  useEffect(() => {
    const modulos = usuario?.modulos || ['soft'];
    if (modulos.length === 1 && modulos[0] === 'soft') {
      // Não redireciona — deixa ver a plataforma mesmo com 1 módulo
      // Para auto-redirect, descomente:
      // navigate('/soft/dashboard');
    }
  }, [usuario]);

  function acessar(rota) {
    if (rota) navigate(rota);
  }

  return (
    <div style={{
      minHeight:      '100vh',
      background:     'var(--color-bg)',
      display:        'flex',
      flexDirection:  'column',
    }}>

      {/* Header */}
      <header style={{
        padding:        'var(--space-5) var(--space-8)',
        borderBottom:   '1px solid var(--color-border)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        background:     'var(--color-surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 36, height: 36,
            background:   '#6366f1',
            borderRadius: 10,
            display:      'flex', alignItems: 'center', justifyContent: 'center',
            fontSize:     18, fontWeight: 700, color: '#fff',
            fontFamily:   'var(--font-sans)',
          }}>R</div>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
              Rebeca
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>
              Plataforma de gestão
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>
            {usuario?.nome || usuario?.email || ''}
          </span>
          <button
            onClick={() => { localStorage.clear(); navigate('/login'); }}
            style={{
              padding:      'var(--space-2) var(--space-3)',
              background:   'transparent',
              border:       '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color:        'var(--color-text-3)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-sans)',
              cursor:       'pointer',
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Hero */}
      <div style={{
        padding:    'var(--space-10) var(--space-8) var(--space-8)',
        textAlign:  'center',
        maxWidth:   640,
        margin:     '0 auto',
      }}>
        <div style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            'var(--space-2)',
          padding:        '4px 14px',
          borderRadius:   'var(--radius-full)',
          background:     'rgba(99,102,241,0.1)',
          border:         '1px solid rgba(99,102,241,0.2)',
          fontSize:       'var(--text-xs)',
          color:          '#6366f1',
          fontWeight:     'var(--weight-medium)',
          marginBottom:   'var(--space-5)',
        }}>
          ✦ Ecossistema Rebeca
        </div>

        <h1 style={{
          fontSize:     'clamp(28px, 4vw, 40px)',
          fontWeight:   'var(--weight-bold)',
          color:        'var(--color-text)',
          lineHeight:   1.2,
          marginBottom: 'var(--space-4)',
          letterSpacing: '-0.5px',
        }}>
          Tudo que seu negócio<br />
          <span style={{ color: '#6366f1' }}>precisa em um lugar</span>
        </h1>

        <p style={{
          fontSize:   'var(--text-base)',
          color:      'var(--color-text-2)',
          lineHeight: 1.6,
        }}>
          Escolha o módulo que deseja acessar. Cada ferramenta foi construída para funcionar sozinha e ainda melhor em conjunto.
        </p>
      </div>

      {/* Grid módulos */}
      <div style={{
        padding:   '0 var(--space-8) var(--space-10)',
        maxWidth:  960,
        margin:    '0 auto',
        width:     '100%',
      }}>
        <div style={{
          display:               'grid',
          gridTemplateColumns:   'repeat(auto-fit, minmax(220px, 1fr))',
          gap:                   'var(--space-4)',
        }}>
          {MODULES.map(mod => (
            <ProductCard key={mod.id} mod={mod} onAcessar={acessar} />
          ))}
        </div>

        {/* Rodapé plataforma */}
        <div style={{
          marginTop:  'var(--space-10)',
          textAlign:  'center',
          fontSize:   'var(--text-xs)',
          color:      'var(--color-text-3)',
        }}>
          Rebeca Plataforma · Versão 1.0 · Todos os módulos em um ecossistema
        </div>
      </div>
    </div>
  );
}
