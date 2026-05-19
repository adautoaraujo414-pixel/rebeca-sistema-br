'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
const cadernos = [
  { id:'1', nome:'Cálculo I', professor:'Prof. Silva', cor:'#6366f1', emoji:'📐', aulas:8, resumos:6 },
  { id:'2', nome:'Física II', professor:'Prof. Costa', cor:'#0ea5e9', emoji:'⚡', aulas:5, resumos:5 },
  { id:'3', nome:'Programação', professor:'Prof. Lima', cor:'#22c55e', emoji:'💻', aulas:12, resumos:10 },
]
export default function Cadernos() {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const filtrados = cadernos.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
  return (
    <div style={{minHeight:'100dvh',background:'var(--bg)',padding:'0 0 100px'}}>
      <div style={{padding:'56px 24px 24px',background:'linear-gradient(180deg,#1e1b4b 0%,var(--bg) 100%)'}}>
        <h1 style={{fontSize:'1.5rem',fontWeight:800,marginBottom:4}}>📚 Meus Cadernos</h1>
        <p style={{color:'var(--txt2)',fontSize:'0.85rem',marginBottom:20}}>Suas aulas organizadas por matéria</p>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 Buscar caderno..." style={{width:'100%',padding:'12px 16px',background:'var(--bg2)',border:'1px solid var(--bg3)',borderRadius:12,color:'var(--txt1)',fontSize:'0.9rem',outline:'none'}}/>
      </div>
      <div style={{padding:'0 24px'}}>
        <button className="btn-primary" style={{width:'100%',marginBottom:20}}>+ Novo Caderno</button>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {filtrados.map((c,i)=>(
            <div key={c.id} style={{animationDelay:`${i*0.07}s`,background:'var(--bg2)',border:'1px solid var(--bg3)',borderRadius:16,padding:20,cursor:'pointer',display:'flex',alignItems:'center',gap:16}} onClick={()=>router.push('/cadernos/'+c.id)}>
              <div style={{width:56,height:56,borderRadius:14,background:c.cor+'22',border:`2px solid ${c.cor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>{c.emoji}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:'1rem',marginBottom:2}}>{c.nome}</div>
                <div style={{color:'var(--txt3)',fontSize:'0.78rem',marginBottom:8}}>{c.professor}</div>
                <div style={{display:'flex',gap:12}}>
                  <span style={{fontSize:'0.75rem',background:'var(--bg3)',borderRadius:6,padding:'3px 8px',color:'var(--txt2)'}}>🎙️ {c.aulas} aulas</span>
                  <span style={{fontSize:'0.75rem',background:'var(--bg3)',borderRadius:6,padding:'3px 8px',color:'var(--txt2)'}}>📝 {c.resumos} resumos</span>
                </div>
              </div>
              <div style={{color:'var(--txt3)',fontSize:20}}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
