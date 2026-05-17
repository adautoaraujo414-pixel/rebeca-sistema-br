import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PrivateRoute } from './PrivateRoute';
import { AppLayout }    from '../layouts/AppLayout';

const Login      = lazy(() => import('../modules/Login'));
const Home       = lazy(() => import('../platform/Home'));
const Dashboard  = lazy(() => import('../modules/soft/Dashboard'));
const Produtos   = lazy(() => import('../modules/soft/Produtos'));
const Categorias = lazy(() => import('../modules/soft/Categorias'));
const PDV        = lazy(() => import('../modules/soft/PDV'));
const Financeiro = lazy(() => import('../modules/soft/Financeiro'));

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

        {/* Público */}
        <Route path="/login" element={<Login />} />

        {/* Home plataforma — fora do AppLayout */}
        <Route path="/" element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        } />

        {/* Rebeca Soft — dentro do AppLayout */}
        <Route path="/soft" element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/soft/dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="produtos"   element={<Produtos />} />
          <Route path="categorias" element={<Categorias />} />
          <Route path="pdv"        element={<PDV />} />
          <Route path="financeiro" element={<Financeiro />} />
        </Route>

        {/* Rotas antigas — redireciona para soft */}
        <Route path="/dashboard"  element={<Navigate to="/soft/dashboard"  replace />} />
        <Route path="/produtos"   element={<Navigate to="/soft/produtos"   replace />} />
        <Route path="/categorias" element={<Navigate to="/soft/categorias" replace />} />
        <Route path="/pdv"        element={<Navigate to="/soft/pdv"        replace />} />
        <Route path="/financeiro" element={<Navigate to="/soft/financeiro" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Suspense>
  );
}
