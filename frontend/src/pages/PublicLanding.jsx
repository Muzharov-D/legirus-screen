// Корневая landing-страница для родителей: рассылка short-link → выбор команды.
// Если в localStorage есть сохранённый возраст → автоматический редирект на свою команду.
// Иначе — 4 большие карточки U14/U15/U16/U17 для выбора.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGE_GROUPS, tierForAge } from '../utils/ageRating';
import OfflineBanner from '../components/OfflineBanner';
import './PublicLanding.css';

const LAST_AGE_KEY = 'legirus.public.lastAge';

// Список карточек: от младшего к старшему (как в основной шапке)
const AGES_REV = [...AGE_GROUPS].reverse();

export default function PublicLanding() {
  const navigate = useNavigate();

  // При заходе на / — если есть сохранённый возраст, редиректим
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_AGE_KEY);
      if (saved && AGE_GROUPS.includes(saved)) {
        navigate(`/public/team/${saved}`, { replace: true });
        return; // редирект — prefetch не нужен
      }
    } catch {}
    // Подменяем title и theme-color на public-вариант
    const orig = document.title;
    document.title = 'ФК Легирус · Расписание';
    let themeColor = document.querySelector('meta[name="theme-color"]');
    const originalTheme = themeColor?.getAttribute('content') || null;
    if (themeColor) themeColor.setAttribute('content', '#1a0606');

    // Prefetch публичного расписания всех 4 возрастов в фоне.
    // Пока родитель смотрит на карточки — браузер уже тянет данные с edge-кеша.
    // К моменту тапа всё в HTTP-cache → мгновенный рендер.
    // Brotli-сжатые ответы по 11-15 КБ, суммарно ~50 КБ — терпимо даже на 4G.
    const ac = new AbortController();
    const prefetch = () => {
      AGE_GROUPS.forEach((a) => {
        ['calendar', 'standings', 'trainings'].forEach((kind) => {
          fetch(`/api/public/${kind}/${a}`, {
            signal: ac.signal,
            // low-priority: не мешает основной отрисовке
            priority: 'low',
            credentials: 'omit',
          }).catch(() => {});
        });
      });
    };
    // requestIdleCallback — ждём, пока браузер закончит рендер карточек
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(prefetch, { timeout: 1500 });
    } else {
      setTimeout(prefetch, 300);
    }


    return () => {
      ac.abort();
      document.title = orig;
      if (themeColor && originalTheme) themeColor.setAttribute('content', originalTheme);
    };
  }, [navigate]);

  function pick(age) {
    try { localStorage.setItem(LAST_AGE_KEY, age); } catch {}
    navigate(`/public/team/${age}`);
  }

  return (
    <div className="landing">
      <OfflineBanner />
      <div className="landing__container">
        <div className="landing__hero">
          <img src="/icons/legirus.png" alt="ФК Легирус" className="landing__logo" />
          <div className="landing__title">ФК&nbsp;Легирус</div>
          <div className="landing__subtitle">Выберите год рождения ребёнка</div>
        </div>

        <div className="landing__grid">
          {AGES_REV.map((a) => (
            <button
              key={a}
              type="button"
              className="landing__card"
              onClick={() => pick(a)}
            >
              <div className="landing__card-year">{a}</div>
              <div className="landing__card-tier">{tierForAge(a)}</div>
            </button>
          ))}
        </div>
        <div className="landing__hint">Расписание матчей и тренировок в одном месте</div>
      </div>
    </div>
  );
}
