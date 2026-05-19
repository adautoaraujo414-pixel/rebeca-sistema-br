'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const steps = [
  {
    emoji: '🎓',
    title: 'Bem-vindo ao Beca Estuda',
    sub: 'Sua plataforma universitária inteligente. Grave aulas, gere resumos automáticos e estude com IA.',
    btn: 'Começar',
  },
  {
    emoji: '🎙️',
    title: 'Grave suas aulas',
    sub: 'Grave qualquer aula direto pelo celular. A IA transcreve, resume e cria exercícios automaticamente.',
    btn: 'Continuar',
    perm: 'microphone',
  },
  {
    emoji: '📚',
    title: 'Organização automática',
    sub: 'A IA detecta a matéria, separa os assuntos e organiza tudo nos seus cadernos sem você precisar fazer nada.',
    btn: 'Continuar',
  },
  {
    emoji: '🧠',
    title: 'Treine e evolua',
    sub: 'Exercícios, simulados e flashcards criados pela IA com base exatamente no que seu professor ensinou.',
    btn: 'Instalar o App',
    install: true,
  },
]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const router = useRouter()
  const s = steps[step]

  async function next() {
    if (s.perm === 'microphone') {
      try { await navigator.mediaDevices.getUserMedia({ audio: true }) } catch {}
    }
    if (s.install) {
      localStorage.setItem('beca_onboarded', '1')
      router.push('/home')
      return
    }
    if (step < steps.length - 1) setStep(step + 1)
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 48 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 28 : 8, height: 8,
            borderRadius: 4, background: i === step ? '#6366f1' : '#334155',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      <div className="fade-up" style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 80, marginBottom: 32, lineHeight: 1 }}>{s.emoji}</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>{s.title}</h1>
        <p style={{ color: 'var(--txt2)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 48 }}>{s.sub}</p>
        <button className="btn-primary" onClick={next} style={{ width: '100%', padding: '16px' }}>
          {s.btn}
        </button>
        {step > 0 && (
          <button onClick={() => router.push('/home')} style={{
            marginTop: 16, background: 'none', border: 'none', color: 'var(--txt3)',
            fontSize: '0.85rem', cursor: 'pointer',
          }}>
            Pular
          </button>
        )}
      </div>
    </div>
  )
}
