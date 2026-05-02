import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import './AppHeader.css';

const ROLE_LABELS = {
  head_coach: 'Главный тренер',
  team_coach: 'Тренер команды',
  player: 'Игрок',
};

export default function AppHeader() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { teams, selectedTeam, selectedTeamId, select } = useTeam();
  const canSwitch = user?.role === 'head_coach';
  const activeTeams = (teams || []).filter((t) => t.active && t.isOurTeam !== false);

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
              {ROLE_LABELS[user.role] || user.role || ''}
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
        <div className={'app-header__team-selector' + (canSwitch ? ' app-header__team-selector--switchable' : '')}>
          {canSwitch ? (
            <select
              className="app-header__team-select"
              value={selectedTeamId || ''}
              onChange={(e) => select(e.target.value)}
              disabled={activeTeams.length === 0}
            >
              {activeTeams.length === 0 && <option value="">Нет активных команд</option>}
              {activeTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="app-header__team-name">
              {selectedTeam?.name || '—'}
            </span>
          )}
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
