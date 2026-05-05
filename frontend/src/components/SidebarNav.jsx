import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SidebarNav.css';

export default function SidebarNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isPlayer } = useAuth();

  const navItems = [
    { id: 'club',      label: 'Мой КЛУБ',  path: '/club',      icon: '🏆' },
    { id: 'analytics', label: 'Аналитика', path: '/analytics', icon: '◉' },
    { id: 'matches',   label: 'Матч',      path: '/matches',   icon: '⚽' },
    { id: 'calendar',  label: 'Календарь', path: '/calendar',  icon: '📅' },
    isPlayer && user?.playerId
      ? { id: 'me', label: 'Мой профиль', path: `/players/${user.playerId}`, icon: '👤' }
      : { id: 'players', label: 'Игроки', path: '/players', icon: '👤' },
  ];

  function isActive(item) {
    if (item.id === 'club')      return pathname === '/club' || pathname === '/';
    if (item.id === 'analytics') return pathname.startsWith('/analytics');
    if (item.id === 'matches')   return pathname.startsWith('/matches');
    if (item.id === 'calendar')  return pathname.startsWith('/calendar');
    if (item.id === 'me')        return pathname === item.path;
    if (item.id === 'players')   return pathname.startsWith('/players');
    return false;
  }

  return (
    <nav className="sidebar-nav">
      {navItems.map((it) => (
        <button
          key={it.id}
          data-nav-id={it.id}
          className={`sidebar-nav__item ${isActive(it) ? 'sidebar-nav__item--active' : ''}`}
          onClick={() => navigate(it.path)}
          title={it.label}
        >
          <span className="sidebar-nav__icon">{it.icon}</span>
          <span className="sidebar-nav__label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
