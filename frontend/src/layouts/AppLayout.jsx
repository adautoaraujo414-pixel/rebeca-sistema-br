import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{
        flex: 1,
        marginLeft: 'var(--sidebar-width)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }} className="main-content">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main style={{
          flex: 1,
          padding: 'var(--space-6)',
          maxWidth: '1400px',
          width: '100%',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
