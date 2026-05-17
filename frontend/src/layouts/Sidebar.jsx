import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, Tag, ShoppingCart,
  Users, TrendingUp, X, Store,
} from 'lucide-react';
import { useAuth } from '../shared/hooks/useAuth';

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/produtos',    icon: Package,          label: 'Produtos' },
  { to: '/categorias',  icon: Tag,              label: 'Categorias' },
  { to: '/clientes',    icon: Users,            label: 'Clientes' },
  { to: '/vendas',      icon: ShoppingCart,     label: 'Vendas' },
  { to: '/financeiro',  icon: TrendingUp,       label: 'Financeiro' },
];

export function Sidebar({ open, onClose }) {
  const { admin } = useAuth();

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 40,
          }}
          onClick={onClose}
        />
      )}
      <aside style={{
        position: 'fixed', top: 0, left: 0,
        width: 'var(--sidebar-width)',
        height: '100vh',
        background: 'var(--color-bg)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        transform: open ? 'translateX(0)' : undefined,
        transition: 'transform var(--transition-normal)',
      }}
      className="sidebar"
      >
        {/* Logo */}
        <div style={{
          height: 'var(--topbar-height)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Store size={20} color="var(--color-primary)" />
            <span style={{
              fontWeight: 'var(--weight-semi)',
              fontSize: 'var(--text-md)',
              color: 'var(--color-text)',
            }}>
              {admin?.nomeLoja || 'Rebeca Soft'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn-icon close-btn"
            style={{ display: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: 'var(--space-3) 0', overflowY: 'auto' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-4)',
                margin: '1px var(--space-2)',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-2)',
                background: isActive ? 'var(--color-primary-bg)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                fontSize: 'var(--text-base)',
                fontWeight: isActive ? 'var(--weight-medium)' : 'var(--weight-normal)',
                transition: 'all var(--transition-fast)',
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer admin */}
        <div style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid var(--color-border)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-3)',
        }}>
          {admin?.nome} · {admin?.plano}
        </div>
      </aside>
    </>
  );
}
