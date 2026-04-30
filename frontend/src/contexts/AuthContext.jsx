import { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, getToken } from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isCoach: user?.role === 'coach',
    isPlayer: user?.role === 'player',
    canSeePlayer: (playerId) =>
      user?.role === 'coach' || (user?.role === 'player' && user.playerId === playerId),
    login: async (u, p) => {
      const usr = await apiLogin(u, p);
      setUser(usr);
      return usr;
    },
    logout: () => { apiLogout(); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
