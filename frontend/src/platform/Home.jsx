import { useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';

const MODULES = [
  {
    id:       'soft',
    nome:     'Rebeca Soft',
    tagline:  'Gestão operacional completa',
    descricao:'PDV, estoque, financeiro e relatórios em tempo real.',
    rota:     '/soft/dashboard',
    status:   'active',
    cor:      '#6366f1',
    glow:     'rgba(99,102,241,0.18)',
    badge:    'Ativo',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="2" y="14" width="7" height="12" rx="1.5" fill="#6366f1" opacity="0.9"/>
        <rect x="10.5" y="8" width="7" height="18" rx="1.5" fill="#6366f1"/>
        <rect x="19" y="3" width="7" height="23" rx="1.5" fill="#6366f1" opacity="0.7"/>
        <rect x="1" y="25" width="26" height="1.5" rx="0.75" fill="#6366f1" opacity="0.4"/>
      </svg>
    ),
  },
  {
    id:       'delivery',
    nome:     'Rebeca Delivery',
    tagline:  'Logística e pedidos inteligentes',
    descricao:'Cardápio digital, rastreamento e gestão de entregas.',
    rota:     '/delivery',
    status:   'coming',
    cor:      '#f59e0b',
    glow:     'rgba(245,158,11,0.15)',
    badge:    'Em breve',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.3"/>
        <circle cx="14" cy="14" r="7" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.6"/>
        <circle cx="14" cy="14" r="3" fill="#f59e0b"/>
        <line x1="14" y1="3" x2="14" y2="7" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="14" y1="21" x2="14" y2="25" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="3" y1="14" x2="7" y2="14" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="21" y1="14" x2="25" y2="14" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id:       'agenda',
    nome:     'Agenda Rebeca',
    tagline:  'Agendamentos sem atrito',
    descricao:'Horários, clientes e lembretes automáticos integrados.',
    rota:     '/agenda',
    status:   'coming',
    cor:      '#10b981',
    glow:     'rgba(16,185,129,0.15)',
    badge:    'Em breve',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="6" width="22" height="19" rx="3" stroke="#10b981" strokeWidth="1.5" fill="none"/>
        <line x1="3" y1="11" x2="25" y2="11" stroke="#10b981" strokeWidth="1.5" opacity="0.5"/>
        <line x1="9" y1="3" x2="9" y2="9" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
        <line x1="19" y1="3" x2="19" y2="9" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
        <rect x="7" y="15" width="4" height="4" rx="1" fill="#10b981" opacity="0.9"/>
        <rect x="13" y="15" width="4" height="4" rx="1" fill="#10b981" opacity="0.5"/>
        <rect x="7" y="20" width="4" height="3" rx="1" fill="#10b981" opacity="0.4"/>
      </svg>
    ),
  },
  {
    id:       'ia',
    nome:     'Rebeca IA',
    tagline:  'Inteligência operacional',
    descricao:'Previsões, insights automáticos e decisões assistidas.',
    rota:     null,
    status:   'soon',
    cor:      '#8b5cf6',
    glow:     'rgba(139,92,246,0.15)',
    badge:    'Roadmap',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="5" fill="#8b5cf6" opacity="0.9"/>
        <circle cx="14" cy="14" r="9" stroke="#8b5cf6" strokeWidth="0.75" fill="none" strokeDasharray="2 2" opacity="0.5"/>
        <circle cx="14" cy="5"  r="1.5" fill="#8b5cf6" opacity="0.7"/>
        <circle cx="14" cy="23" r="1.5" fill="#8b5cf6" opacity="0.7"/>
        <circle cx="5"  cy="14" r="1.5" fill="#8b5cf6" opacity="0.7"/>
        <circle cx="23" cy="14" r="1.5" fill="#8b5cf6" opacity="0.7"/>
        <circle cx="8"  cy="8"  r="1"   fill="#8b5cf6" opacity="0.4"/>
        <circle cx="20" cy="8"  r="1"   fill="#8b5cf6" opacity="0.4"/>
        <circle cx="8"  cy="20" r="1"   fill="#8b5cf6" opacity="0.4"/>
        <circle cx="20" cy="20" r="1"   fill="#8b5cf6" opacity="0.4"/>
      </svg>
    ),
  },
];

function ProductCard({ mod, onAcessar }) {
  const active = mod.status === 'active';
  const soon   = mod.status === 'soon';

  return (
    <div
      onClick={() => active && onAcessar(mod.rota)}
      style={{
        position:      'relative',
        background:    'linear-gradient(145deg, var(--color-surface) 0%, var(--color-surface-2, var(--color-surface)) 100%)',
        border:        `1px solid ${active ? mod.cor + '35' : 'var(--color-border)'}`,
        borderRadius:  16,
        padding:       '28px 24px 24px',
        cursor:        active ? 'pointer' : 'default',
        transition:    'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
        opacity:       soon ? 0.55 : 1,
        display:       'flex',
        flexDirection: 'column',
        gap:           20,
        backdropFilter:'blur(8px)',
      }}
      onMouseEnter={e => {
        if (soon) return;
        e.currentTarget.style.transform   = 'translateY(-3px)';
        e.currentTarget.style.boxShadow   = `0 12px 40px ${mod.glow}, 0 2px 8px rgba(0,0,0,0.12)`;
        e.currentTarget.style.borderColor = mod.cor + '55';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform   = 'translateY(0)';
        e.currentTarget.style.boxShadow   = 'none';
        e.currentTarget.style.borderColor = active ? mod.cor + '35' : 'var(--color-border)';
      }}
    >
      {/* Badge */}
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <span style={{
          fontSize:     11,
          fontWeight:   600,
          letterSpacing:'0.04em',
          padding:      '3px 10px',
          borderRadius: 99,
          background:   active ? mod.cor + '18' : 'var(--color-border)',
          color:        active ? mod.cor : 'var(--color-text-3)',
          border:       `1px solid ${active ? mod.cor + '35' : 'transparent'}`,
          fontFamily:   'var(--font-sans)',
          textTransform:'uppercase',
        }}>
          {mod.badge}
        </span>
      </div>

      {/* Ícone com glow container */}
      <div style={{
        width:         52, height: 52,
        borderRadius:  14,
        background:    mod.cor + '12',
        border:        `1px solid ${mod.cor}25`,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        boxShadow:     active ? `0 0 20px ${mod.glow}` : 'none',
        flexShrink:    0,
      }}>
        {mod.icon}
      </div>

      {/* Texto */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize:     16,
          fontWeight:   700,
          color:        'var(--color-text)',
          marginBottom: 4,
          letterSpacing:'-0.2px',
          fontFamily:   'var(--font-sans)',
        }}>
          {mod.nome}
        </div>
        <div style={{
          fontSize:     12,
          fontWeight:   600,
          color:        mod.cor,
          marginBottom: 8,
          letterSpacing:'0.02em',
          fontFamily:   'var(--font-sans)',
        }}>
          {mod.tagline}
        </div>
        <div style={{
          fontSize:   13,
          color:      'var(--color-text-3)',
          lineHeight: 1.55,
          fontFamily: 'var(--font-sans)',
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
          height:       38,
          background:   active
            ? `linear-gradient(135deg, ${mod.cor} 0%, ${mod.cor}cc 100%)`
            : 'transparent',
          border:       `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
          borderRadius: 10,
          color:        active ? '#fff' : 'var(--color-text-3)',
          fontSize:     13,
          fontWeight:   600,
          letterSpacing:'0.01em',
          fontFamily:   'var(--font-sans)',
          cursor:       active ? 'pointer' : 'not-allowed',
          transition:   'opacity 0.15s ease',
          boxShadow:    active ? `0 2px 12px ${mod.glow}` : 'none',
        }}
        onMouseEnter={e => { if (active) e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={e => { if (active) e.currentTarget.style.opacity = '1'; }}
      >
        {active ? 'Acessar módulo' : mod.status === 'coming' ? 'Em breve' : 'No roadmap'}
      </button>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        padding:        '0 40px',
        height:         60,
        borderBottom:   '1px solid var(--color-border)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        background:     'var(--color-surface)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34,
            background:    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius:  10,
            display:       'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow:     '0 2px 12px rgba(99,102,241,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="9" width="4" height="8" rx="1" fill="white" opacity="0.9"/>
              <rect x="7" y="5" width="4" height="12" rx="1" fill="white"/>
              <rect x="13" y="1" width="4" height="16" rx="1" fill="white" opacity="0.75"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.2px', fontFamily: 'var(--font-sans)' }}>
              Rebeca
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', letterSpacing: '0.03em', fontFamily: 'var(--font-sans)' }}>
              PLATAFORMA
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontFamily: 'var(--font-sans)' }}>
            {usuario?.nome || usuario?.email || ''}
          </span>
          <button
            onClick={() => { localStorage.clear(); navigate('/login'); }}
            style={{
              padding:      '6px 14px',
              background:   'transparent',
              border:       '1px solid var(--color-border)',
              borderRadius: 8,
              color:        'var(--color-text-3)',
              fontSize:     13,
              fontFamily:   'var(--font-sans)',
              cursor:       'pointer',
              transition:   'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-3)'; e.currentTarget.style.color = 'var(--color-text-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-3)'; }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Hero */}
      <div style={{ padding: '64px 40px 48px', textAlign: 'center', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{
          display:     'inline-flex', alignItems: 'center', gap: 6,
          padding:     '4px 14px', borderRadius: 99,
          background:  'rgba(99,102,241,0.08)',
          border:      '1px solid rgba(99,102,241,0.2)',
          fontSize:    12, color: '#6366f1',
          fontWeight:  600, letterSpacing: '0.04em',
          fontFamily:  'var(--font-sans)',
          marginBottom:24,
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="5" r="3" fill="#6366f1"/>
            <circle cx="5" cy="5" r="5" fill="none" stroke="#6366f1" strokeWidth="0.75" opacity="0.4"/>
          </svg>
          ECOSSISTEMA REBECA
        </div>

        <h1 style={{
          fontSize:     'clamp(26px, 4vw, 38px)',
          fontWeight:   800,
          color:        'var(--color-text)',
          lineHeight:   1.15,
          marginBottom: 16,
          letterSpacing:'-0.8px',
          fontFamily:   'var(--font-sans)',
        }}>
          Tudo que seu negócio<br />
          <span style={{ color: '#6366f1' }}>precisa, em um lugar</span>
        </h1>

        <p style={{ fontSize: 15, color: 'var(--color-text-2)', lineHeight: 1.65, fontFamily: 'var(--font-sans)' }}>
          Escolha o módulo que deseja acessar. Cada produto foi construído para funcionar de forma independente — e ainda melhor em conjunto.
        </p>
      </div>

      {/* Grid */}
      <div style={{ padding: '0 40px 64px', maxWidth: 960, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          {MODULES.map(mod => (
            <ProductCard key={mod.id} mod={mod} onAcessar={r => navigate(r)} />
          ))}
        </div>

        <div style={{ marginTop: 48, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)', fontFamily: 'var(--font-sans)', letterSpacing: '0.03em' }}>
          REBECA PLATAFORMA · V1.0
        </div>
      </div>
    </div>
  );
}
