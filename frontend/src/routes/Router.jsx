import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PrivateRoute } from './PrivateRoute';
import { AppLayout } from '../layouts/AppLayout';

const Login     = lazy(() => import('../modules/Login'));
const Dashboard = lazy(() => import('../modules/Dashboard'));
const Produtos  = lazy(() => import('../modules/Produtos'));

function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)',
      color: 'var(--color-text-2)',
      fontSize: 'var(--text-base)',
    }}>
      Carregando...
    </div>
  );
}

export function Router() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="produtos" element={<Produtos />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
