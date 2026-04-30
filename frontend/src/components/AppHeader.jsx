import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AppHeader.css';

export default function AppHeader() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="app-header__left" onClick={() => navigate('/analytics')}>
        <img
          src="/assets/logos/log-3_white.png"
          alt="АванDата"
          className="app-header__brand-logo"
        />
        <span className="app-header__brand-sep">×</span>
        <img
          src="/assets/logos/legirus.png"
          alt="ФК Легирус"
          className="app-header__club-logo"
        />
        <div className="app-header__brand-text">
          <span className="app-header__brand-club">ФК Легирус</span>
          <span className="app-header__brand-sub">Золотой профиль спортсмена</span>
        </div>
      </div>
      <div className="app-header__right">
        {user && (
          <div className="app-header__user">
            <div className="app-header__user-name">{user.fullName}</div>
            <div className="app-header__user-role">
              {user.role === 'coach' ? 'Тренер' : 'Игрок'}
            </div>
          </div>
        )}
        {user && (
          <button
            className="app-header__btn app-header__btn--logout"
            onClick={() => logout()}
            title="Выйти"
          >Выход</button>
        )}
        <div className="app-header__club-selector">
          <span className="app-header__club-name">Легирус 2010</span>
          <span className="app-header__club-arrow">▾</span>
        </div>
        <button className="app-header__btn" disabled title="Язык">РУС</button>
        <button
          className="app-header__btn app-header__btn--refresh"
          onClick={() => window.location.reload()}
          title="Обновить данные"
        >↻</button>
      </div>
    </header>
  );
}
