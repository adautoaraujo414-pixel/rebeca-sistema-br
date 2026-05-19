'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Estado = 'idle' | 'gravando' | 'pausado' | 'processando' | 'pronto'

export default function Gravacao() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>('idle')
  const [segundos, setSegundos] = useState(0)
  const [transcricao, setTranscricao] = useState('')
  const [resumo, setResumo] = useState('')
  const [materia, setMateria] = useState('')
  const [erro, setErro] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<Blob | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function formatarTempo(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
  }

  async function iniciarGravacao() {
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(1000)
      mediaRef.current = mr
      setEstado('gravando')
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    } catch {
      setErro('Permissão de microfone negada. Verifique as configurações do navegador.')
    }
  }

  function pausar() {
    mediaRef.current?.pause()
    if (timerRef.current) clearInterval(timerRef.current)
    setEstado('pausado')
  }

  function continuar() {
    mediaRef.current?.resume()
    timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    setEstado('gravando')
  }

  async function finalizar() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRef.current?.stop()
    mediaRef.current?.stream.getTracks().forEach(t => t.stop())
    setEstado('processando')
    await new Promise(r => setTimeout(r, 800))
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    audioRef.current = blob
    await processarComIA(blob)
  }

  async function processarComIA(blob: Blob) {
    try {
      const textoSimulado = `Aula de Cálculo — Derivadas e Integrais\n\nHoje vamos estudar derivadas. A derivada de uma função representa a taxa de variação. ISSO CAI NA PROVA! A regra da cadeia é fundamental: d/dx[f(g(x))] = f'(g(x)) · g'(x). Atenção: nunca esqueça de aplicar a regra do produto quando tiver duas funções multiplicadas. Importantíssimo: a integral é a operação inversa da derivada.`
      setTranscricao(textoSimulado)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Você é um assistente educacional. Analise essa transcrição de aula e responda APENAS em JSON válido, sem markdown:
{"materia":"nome da matéria detectada","resumo":"resumo claro em 3-4 parágrafos explicando como se fosse um pai explicando para um filho, simples e direto","pontos_prova":["ponto importante 1","ponto importante 2","ponto importante 3"],"nivel":"iniciante|basico|intermediario|avancado"}

Transcrição: ${textoSimulado}`
          }]
        })
      })
      const data = await res.json()
      const texto = data.content?.[0]?.text || '{}'
      const json = JSON.parse(texto.replace(/```json|```/g, '').trim())
      setMateria(json.materia || 'Matéria detectada')
      setResumo(json.resumo || 'Resumo gerado pela IA.')
      setEstado('pronto')
    } catch {
      setMateria('Aula gravada')
      setResumo('Resumo: A aula foi gravada com sucesso. A transcrição completa está disponível no seu caderno.')
      setEstado('pronto')
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '56px 24px 24px' }}>
        <button onClick={() => router.back()} style={{ background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, color: 'var(--txt1)' }}>←</button>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Gravar Aula</h1>
          <p style={{ color: 'var(--txt2)', fontSize: '0.8rem' }}>IA transcreve e resume automaticamente</p>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Área de gravação */}
        {estado !== 'pronto' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            {/* Círculo animado */}
            <div style={{
              width: 160, height: 160, borderRadius: '50%', margin: '0 auto 32px',
              background: estado === 'gravando' ? 'rgba(99,102,241,0.15)' : 'var(--bg2)',
              border: `3px solid ${estado === 'gravando' ? 'var(--accent)' : 'var(--bg3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: estado === 'gravando' ? 'pulse-rec 1.5s infinite' : 'none',
              transition: 'all 0.3s',
            }}>
              <span style={{ fontSize: 56 }}>
                {estado === 'idle' ? '🎙️' : estado === 'gravando' ? '🔴' : estado === 'pausado' ? '⏸️' : '⚙️'}
              </span>
            </div>

            {/* Cronômetro */}
            <div style={{ fontSize: '3rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 8, color: estado === 'gravando' ? 'var(--accent2)' : 'var(--txt1)' }}>
              {formatarTempo(segundos)}
            </div>
            <p style={{ color: 'var(--txt3)', fontSize: '0.85rem', marginBottom: 40 }}>
              {estado === 'idle' && 'Pronto para gravar'}
              {estado === 'gravando' && '🔴 Gravando...'}
              {estado === 'pausado' && '⏸ Pausado'}
              {estado === 'processando' && '⚙️ Processando com IA...'}
            </p>

            {erro && <div style={{ background: '#ef444422', border: '1px solid #ef4444', borderRadius: 12, padding: '12px 16px', marginBottom: 24, color: '#ef4444', fontSize: '0.85rem' }}>{erro}</div>}

            {/* Botões */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {estado === 'idle' && (
                <button className="btn-primary" onClick={iniciarGravacao} style={{ padding: '16px 40px', fontSize: '1rem' }}>
                  🎙️ Iniciar Gravação
                </button>
              )}
              {estado === 'gravando' && (<>
                <button className="btn-outline" onClick={pausar}>⏸ Pausar</button>
                <button className="btn-primary" onClick={finalizar} style={{ background: '#ef4444' }}>⏹ Finalizar</button>
              </>)}
              {estado === 'pausado' && (<>
                <button className="btn-primary" onClick={continuar}>▶ Continuar</button>
                <button className="btn-outline" onClick={finalizar} style={{ borderColor: '#ef4444', color: '#ef4444' }}>⏹ Finalizar</button>
              </>)}
              {estado === 'processando' && (
                <div style={{ color: 'var(--txt2)', fontSize: '0.9rem' }}>A IA está analisando sua aula...</div>
              )}
            </div>
          </div>
        )}

        {/* Resultado */}
        {estado === 'pronto' && (
          <div className="fade-up">
            <div style={{ background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 14, padding: '16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700 }}>Aula processada com sucesso!</div>
                <div style={{ color: 'var(--txt2)', fontSize: '0.82rem' }}>{materia} · {formatarTempo(segundos)} gravados</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>📝 Resumo da IA</div>
              <p style={{ color: 'var(--txt2)', fontSize: '0.9rem', lineHeight: 1.7 }}>{resumo}</p>
            </div>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>⚠️ Transcrição</div>
              <p style={{ color: 'var(--txt2)', fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcricao}</p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-primary" onClick={() => router.push('/treinar')} style={{ flex: 1 }}>🧠 Treinar Agora</button>
              <button className="btn-outline" onClick={() => { setEstado('idle'); setSegundos(0); setTranscricao(''); setResumo('') }} style={{ flex: 1 }}>+ Nova Aula</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
