'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
const questoes = [
  { q:'Qual o resultado de d/dx[x³]?', ops:['2x','3x²','x²','3x³'], c:1, exp:'A regra da potência: baixa o expoente e subtrai 1. Então x³ vira 3x².' },
  { q:'O que representa a integral geometricamente?', ops:['Inclinação da curva','Área sob a curva','Ponto máximo','Derivada segunda'], c:1, exp:'A integral calcula a área entre a curva e o eixo x.' },
  { q:'Qual é a derivada de sen(x)?', ops:['−cos(x)','cos(x)','tg(x)','−sen(x)'], c:1, exp:'A derivada de sen(x) é cos(x). Sen e cos são parceiros — um deriva no outro.' },
]
export default function Simulado() {
  const router = useRouter()
  const [fase, setFase] = useState<'intro'|'quiz'|'fim'>('intro')
  const [atual, setAtual] = useState(0)
  const [sel, setSel] = useState<number|null>(null)
  const [respostas, setRespostas] = useState<boolean[]>([])
  const q = questoes[atual]
  function responder(i:number) {
    if(sel!==null) return
    setSel(i)
    setTimeout(()=>{
      setRespostas(r=>[...r,i===q.c])
      if(atual+1>=questoes.length) setFase('fim')
      else{setAtual(a=>a+1);setSel(null)}
    },1400)
  }
  const acertos = respostas.filter(Boolean).length
  const pct = Math.round(acertos/questoes.length*100)
  if(fase==='intro') return(
    <div style={{minHeight:'100dvh',background:'var(--bg)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,textAlign:'center'}}>
      <div style={{fontSize:72,marginBottom:24}}>📝</div>
      <h1 style={{fontSize:'1.8rem',fontWeight:800,marginBottom:12}}>Simulado</h1>
      <p style={{color:'var(--txt2)',marginBottom:40,maxWidth:320,lineHeight:1.7}}>{questoes.length} questões com explicação da IA após cada resposta.</p>
      <button className="btn-primary" onClick={()=>setFase('quiz')} style={{width:'100%',maxWidth:360,padding:16}}>🚀 Iniciar Simulado</button>
      <button onClick={()=>router.back()} style={{marginTop:16,background:'none',border:'none',color:'var(--txt3)',cursor:'pointer'}}>Voltar</button>
    </div>
  )
  if(fase==='fim') return(
    <div style={{minHeight:'100dvh',background:'var(--bg)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,textAlign:'center'}}>
      <div style={{fontSize:72,marginBottom:20}}>{pct>=70?'🏆':pct>=50?'📈':'💪'}</div>
      <h1 style={{fontSize:'2rem',fontWeight:800,marginBottom:8}}>{pct>=70?'Excelente!':pct>=50?'Bom trabalho!':'Continue!'}</h1>
      <p style={{color:'var(--txt2)',marginBottom:32}}>{acertos} de {questoes.length} acertos</p>
      <div style={{fontSize:'3rem',fontWeight:800,color:pct>=70?'var(--green)':pct>=50?'#f59e0b':'#ef4444',marginBottom:32}}>{pct}%</div>
      <div style={{display:'flex',gap:12,width:'100%',maxWidth:360}}>
        <button className="btn-outline" onClick={()=>{setFase('intro');setAtual(0);setSel(null);setRespostas([])}} style={{flex:1}}>Refazer</button>
        <button className="btn-primary" onClick={()=>router.push('/home')} style={{flex:1}}>Início</button>
      </div>
    </div>
  )
  return(
    <div style={{minHeight:'100dvh',background:'var(--bg)',padding:'56px 24px 40px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div><h1 style={{fontSize:'1.1rem',fontWeight:800}}>Simulado</h1><p style={{color:'var(--txt2)',fontSize:'0.8rem'}}>Questão {atual+1} de {questoes.length}</p></div>
      </div>
      <div style={{height:6,background:'var(--bg3)',borderRadius:3,marginBottom:24,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${(atual/questoes.length)*100}%`,background:'var(--accent)',borderRadius:3,transition:'width 0.4s'}}/>
      </div>
      <div style={{background:'var(--bg2)',border:'1px solid var(--bg3)',borderRadius:16,padding:24,marginBottom:20}}>
        <div style={{fontSize:'0.72rem',color:'#f59e0b',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>📝 Questão {atual+1}</div>
        <p style={{fontSize:'1.05rem',fontWeight:600,lineHeight:1.5}}>{q.q}</p>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {q.ops.map((op,i)=>{
          const isCerta=i===q.c,isSel=i===sel
          let bg='var(--bg2)',border='var(--bg3)',color='var(--txt1)'
          if(sel!==null){if(isCerta){bg='#22c55e22';border='#22c55e';color='#22c55e'}else if(isSel){bg='#ef444422';border='#ef4444';color='#ef4444'}}
          return(<button key={i} onClick={()=>responder(i)} style={{background:bg,border:`1.5px solid ${border}`,borderRadius:12,padding:'14px 16px',textAlign:'left',cursor:sel!==null?'default':'pointer',color,fontSize:'0.9rem',transition:'all 0.25s'}}><span style={{color:'var(--txt3)',marginRight:10,fontSize:'0.8rem'}}>{String.fromCharCode(65+i)})</span>{op}</button>)
        })}
      </div>
      {sel!==null&&<div style={{background:'#6366f122',border:'1px solid #6366f144',borderRadius:14,padding:16,marginTop:16}}><div style={{fontSize:'0.72rem',color:'var(--accent2)',fontWeight:700,marginBottom:8}}>💡 Entenda</div><p style={{color:'var(--txt2)',fontSize:'0.88rem',lineHeight:1.6}}>{q.exp}</p></div>}
    </div>
  )
}
