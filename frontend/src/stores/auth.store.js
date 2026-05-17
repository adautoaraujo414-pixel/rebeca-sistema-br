import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      admin:        null,
      accessToken:  null,
      isAuth:       false,

      setAuth: ({ admin, accessToken }) => set({
        admin, accessToken, isAuth: true,
      }),

      clearAuth: () => set({
        admin: null, accessToken: null, isAuth: false,
      }),

      getToken: () => get().accessToken,
    }),
    {
      name:    'rebeca-soft-auth',
      partialize: (s) => ({
        // Nunca persistir accessToken — apenas admin para UX
        admin:   s.admin,
        isAuth:  false, // forçar re-login após reload
      }),
    }
  )
);
