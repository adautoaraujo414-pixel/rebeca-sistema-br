import { useAuthStore } from '../../stores/auth.store';
import { authApi } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';

export function useAuth() {
  const { admin, isAuth, setAuth, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  async function login(email, senha) {
    const dados = await authApi.login(email, senha);
    setAuth({ admin: dados.admin, accessToken: dados.accessToken });
    navigate('/dashboard');
  }

  async function logout() {
    await authApi.logout();
    clearAuth();
    queryClient.clear();
    navigate('/login');
  }

  return { admin, isAuth, login, logout };
}
