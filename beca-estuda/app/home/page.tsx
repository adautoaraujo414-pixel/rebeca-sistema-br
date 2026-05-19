'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [hora, setHora] = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    setHora(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  const cards = [
    { emoji: '🎙️', label: 'Gravar Aula', sub: 'Gravar e transcrever', route: '/gravacao', color: '#6366f1' },
    { emoji: '📚', label: 'Cadernos', sub: 'Minhas anotações', route: '/cadernos', color: '#0ea5e9' },
    { emoji: '🧠', label: 'Treinar', sub: 'Exercícios e flashcards', route: '/treinar', color: '#22c55e' },
    { emoji: '📝', label: 'Simulado', sub: 'Testar conhecimento', route: '/simulado', color: '#f59e0b' },
  ]

  return (
    <div style={{ minHeight: '100dvh', padding: '0 0 100px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '56px 24px 24px',
        background: 'linear-gradient(180deg, #1e1b4b 0%, var(--bg) 100%)',
      }}>
        <p style={{ color: 'var(--txt2)', fontSize: '0.9rem', marginBottom: 4 }}>{hora} 👋</p>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: 4 }}>Beca Estuda</h1>
        <p style={{ color: 'var(--txt2)', fontSize: '0.85rem' }}>O que vamos estudar hoje?</p>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Botão principal */}
        <button
          className="btn-primary fade-up"
          onClick={() => router.push('/gravacao')}
          style={{ width: '100%', padding: '20px', fontSize: '1.1rem', borderRadius: '18px', marginBottom: 24 }}
        >
          🎙️ Começar a Gravar Aula
        </button>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {cards.map((c, i) => (
            <button
              key={i}
              onClick={() => router.push(c.route)}
              className="fade-up"
              style={{
                background: 'var(--bg2)', border: '1px solid var(--bg3)',
                borderRadius: 16, padding: '20px 16px', textAlign: 'left',
                cursor: 'pointer', transition: 'all 0.2s', animationDelay: `${i * 0.07}s`,
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: 12,
                background: c.color + '22', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 22,
              }}>{c.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 2 }}>{c.label}</div>
              <div style={{ color: 'var(--txt3)', fontSize: '0.78rem' }}>{c.sub}</div>
            </button>
          ))}
        </div>

        {/* Dica do dia */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b, #1e293b)',
          border: '1px solid #4338ca44', borderRadius: 16, padding: '20px',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>💡 Dica do dia</div>
          <p style={{ fontSize: '0.88rem', color: 'var(--txt2)', lineHeight: 1.6 }}>
            Gravar a aula e revisar o resumo em até 24h aumenta em até <strong style={{ color: 'var(--txt1)' }}>80% a retenção</strong> do conteúdo.
          </p>
        </div>
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--bg3)', padding: '12px 0 20px',
        display: 'flex', justifyContent: 'space-around',
      }}>
        {[
          { emoji: '🏠', label: 'Home', route: '/home' },
          { emoji: '📚', label: 'Cadernos', route: '/cadernos' },
          { emoji: '🧠', label: 'Treinar', route: '/treinar' },
          { emoji: '👤', label: 'Perfil', route: '/perfil' },
        ].map((n, i) => (
          <button key={i} onClick={() => router.push(n.route)} style={{
            background: 'none', border: 'none', color: 'var(--txt3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 500,
          }}>
            <span style={{ fontSize: 22 }}>{n.emoji}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
