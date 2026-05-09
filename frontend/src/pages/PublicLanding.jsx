// Корневая landing-страница для родителей: рассылка short-link → выбор команды.
// Если в localStorage есть сохранённый возраст → автоматический редирект на свою команду.
// Иначе — 4 большие карточки U14/U15/U16/U17 для выбора.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGE_GROUPS, tierForAge } from '../utils/ageRating';
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
      }
    } catch {}
    // Подменяем title и theme-color на public-вариант
    const orig = document.title;
    document.title = 'ФК Легирус · Расписание';
    let themeColor = document.querySelector('meta[name="theme-color"]');
    const originalTheme = themeColor?.getAttribute('content') || null;
    if (themeColor) themeColor.setAttribute('content', '#1a0606');
    return () => {
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
