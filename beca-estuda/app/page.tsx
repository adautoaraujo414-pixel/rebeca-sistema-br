'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Root() {
  const router = useRouter()
  useEffect(() => {
    const ok = localStorage.getItem('beca_onboarded')
    router.replace(ok ? '/home' : '/onboarding')
  }, [router])
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ fontSize: 48 }}>🎓</div>
    </div>
  )
}
