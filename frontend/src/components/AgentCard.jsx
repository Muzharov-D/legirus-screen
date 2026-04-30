import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAgentInsight } from '../services/api';
import './AgentCard.css';

const SCREEN_ROUTES = {
  'analytics-overview':     () => '/analytics',
  'comparison':             () => '/analytics/team',
  'analytics-team-positive': () => '/analytics/team',
  'analytics-team-negative': () => '/analytics/team',

  'matches-overview':       () => '/matches',
  'match-initial':          () => '/matches',
  'match-detail':           (ctx) => `/matches/${ctx?.matchId || 'match-001'}`,
  'match-team-aggregates':  (ctx) => `/matches/${ctx?.matchId || 'match-001'}#aggregates`,

  'players-leaders':        () => '/players',
  'players-rating':         () => '/players/rating',
  'players-detail':         (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}` : '/players'),
  'players-detail-vs-team': (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#vs-team` : '/players'),
  'players-detail-by-position': (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#by-position` : '/players'),
  'players-detail-halftime':    (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#halftime` : '/players'),
};

function screenToUrl(screen, context) {
  const fn = SCREEN_ROUTES[screen];
  return fn ? fn(context) : null;
}

export default function AgentCard({ screenId, context, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAgentInsight(screenId, context)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [screenId, JSON.stringify(context || {})]);

  const nextPath = data?.nextStep ? screenToUrl(data.nextStep.screen, context) : null;
  const canGo = Boolean(nextPath);

  function go() {
    if (!canGo) return;
    const [pathname, hash] = nextPath.split('#');
    navigate(hash ? `${pathname}#${hash}` : pathname);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
    onClose?.();
  }

  return (
    <div className="agent-card">
      <div className="agent-card__head">
        <span className="agent-card__title">ИИ-агент</span>
        <button className="agent-card__close" onClick={onClose}>✕</button>
      </div>
      {loading && <div className="agent-card__loading">Анализ экрана…</div>}
      {error && <div className="agent-card__error">Ошибка: {error}</div>}
      {data && (
        <div className="agent-card__body">
          <div className="agent-card__section">
            <div className="agent-card__label">Что важно сейчас</div>
            <div className="agent-card__text">{data.important}</div>
          </div>
          <div className="agent-card__section">
            <div className="agent-card__label">Что это значит</div>
            <div className="agent-card__text">{data.meaning}</div>
          </div>
          {data.nextStep && (
            <button
              className={`agent-card__cta ${canGo ? '' : 'agent-card__cta--disabled'}`}
              onClick={go}
              disabled={!canGo}
              title={canGo ? '' : 'Переход недоступен для этого экрана'}
            >
              {data.nextStep.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
