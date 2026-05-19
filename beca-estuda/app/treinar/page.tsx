'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const exerciciosDemo = [
  { pergunta: 'O que é uma derivada?', resposta: 'A derivada representa a taxa de variação de uma função em um ponto. É como medir a velocidade de mudança — por exemplo, se uma função descreve posição, a derivada diz a velocidade.', opcoes: ['Taxa de variação de uma função','Soma de dois números','Tipo de integral','Operação de adição'], correta: 0 },
  { pergunta: 'Qual é a regra da cadeia?', resposta: 'A regra da cadeia diz: quando você tem uma função dentro de outra, deriva de fora para dentro. d/dx[f(g(x))] = f\'(g(x)) · g\'(x).', opcoes: ['f\'(x) + g\'(x)','f\'(g(x)) · g\'(x)','f(x) · g(x)','f\'(x) · g(x)'], correta: 1 },
  { pergunta: 'Integral é a operação inversa de:', resposta: 'A integral é a operação inversa da derivada. Se a derivada "desfaz" a função, a integral "refaz". Juntas, formam o Teorema Fundamental do Cálculo.', opcoes: ['Adição','Multiplicação','Derivada','Subtração'], correta: 2 },
]

export default function Treinar() {
  const router = useRouter()
  const [atual, setAtual] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [mostrarResp, setMostrarResp] = useState(false)
  const [acertos, setAcertos] = useState(0)
  const [fim, setFim] = useState(false)
  const ex = exerciciosDemo[atual]

  function responder(i: number) {
    if (sel !== null) return
    setSel(i)
    setMostrarResp(true)
    if (i === ex.correta) setAcertos(a => a + 1)
  }

  function proximo() {
    if (atual + 1 >= exerciciosDemo.length) { setFim(true); return }
    setAtual(a => a + 1); setSel(null); setMostrarResp(false)
  }

  if (fim) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>{acertos === exerciciosDemo.length ? '🏆' : acertos >= 2 ? '🎯' : '📚'}</div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 8 }}>Treino concluído!</h1>
      <p style={{ color: 'var(--txt2)', marginBottom: 32 }}>{acertos} de {exerciciosDemo.length} acertos</p>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: 'var(--txt2)', fontSize: '0.85rem' }}>Desempenho</span>
          <span style={{ fontWeight: 700, color: acertos >= 2 ? 'var(--green)' : '#f59e0b' }}>{Math.round(acertos / exerciciosDemo.length * 100)}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${acertos / exerciciosDemo.length * 100}%`, background: acertos >= 2 ? 'var(--green)' : '#f59e0b', borderRadius: 4, transition: 'width 1s' }} />
        </div>
      </div>
      <button className="btn-primary" onClick={() => router.push('/home')} style={{ width: '100%', maxWidth: 360 }}>Voltar ao início</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '0 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '56px 24px 24px' }}>
        <button onClick={() => router.back()} style={{ background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, color: 'var(--txt1)' }}>←</button>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Treinar</h1>
          <p style={{ color: 'var(--txt2)', fontSize: '0.8rem' }}>Exercício {atual + 1} de {exerciciosDemo.length}</p>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(atual / exerciciosDemo.length) * 100}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>🧠 Pergunta</div>
          <p style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.5 }}>{ex.pergunta}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {ex.opcoes.map((op, i) => {
            const isCerta = i === ex.correta
            const isSel = i === sel
            let bg = 'var(--bg2)', border = 'var(--bg3)', color = 'var(--txt1)'
            if (sel !== null) {
              if (isCerta) { bg = '#22c55e22'; border = '#22c55e'; color = '#22c55e' }
              else if (isSel) { bg = '#ef444422'; border = '#ef4444'; color = '#ef4444' }
            }
            return (
              <button key={i} onClick={() => responder(i)} style={{
                background: bg, border: `1.5px solid ${border}`, borderRadius: 12,
                padding: '14px 16px', textAlign: 'left', cursor: sel !== null ? 'default' : 'pointer',
                color, fontWeight: isSel || (sel !== null && isCerta) ? 600 : 400,
                fontSize: '0.9rem', transition: 'all 0.2s',
              }}>
                <span style={{ color: 'var(--txt3)', marginRight: 10, fontSize: '0.8rem' }}>{String.fromCharCode(65 + i)})</span>
                {op}
              </button>
            )
          })}
        </div>

        {mostrarResp && (
          <div className="fade-up" style={{ background: '#6366f122', border: '1px solid #6366f144', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, marginBottom: 8 }}>💡 Entenda a resposta</div>
            <p style={{ color: 'var(--txt2)', fontSize: '0.88rem', lineHeight: 1.6 }}>{ex.resposta}</p>
          </div>
        )}

        {sel !== null && (
          <button className="btn-primary" onClick={proximo} style={{ width: '100%' }}>
            {atual + 1 >= exerciciosDemo.length ? '🏆 Ver resultado' : 'Próxima →'}
          </button>
        )}
      </div>
    </div>
  )
}
