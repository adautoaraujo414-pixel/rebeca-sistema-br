import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../shared/hooks/useAuth';

export function Topbar({ onMenuClick }) {
  const { admin, logout } = useAuth();

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-4)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      <button
        onClick={onMenuClick}
        className="btn-icon menu-btn"
        style={{ display: 'none' }}
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>
          {admin?.email}
        </span>
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-2)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-error)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </header>
  );
}
