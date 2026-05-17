import { useAuth } from '../shared/hooks/useAuth';

export default function Dashboard() {
  const { admin } = useAuth();
  return (
    <div>
      <h1 style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 'var(--weight-bold)',
        color: 'var(--color-text)',
        marginBottom: 'var(--space-2)',
      }}>
        Olá, {admin?.nome?.split(' ')[0]} 👋
      </h1>
      <p style={{ color: 'var(--color-text-2)' }}>
        {admin?.nomeLoja} · Dashboard em construção
      </p>
    </div>
  );
}
