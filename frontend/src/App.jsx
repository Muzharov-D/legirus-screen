import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import { TournamentProvider } from './contexts/TournamentContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import ClubOverview from './pages/ClubOverview';
import ClubPage from './pages/ClubPage';
import MatchesDashboard from './pages/MatchesDashboard';
import MatchDetail from './pages/MatchDetail';
import ComparisonView from './pages/ComparisonView';
import PlayersLeaders from './pages/PlayersLeaders';
import PlayersRating from './pages/PlayersRating';
import PlayerDetail from './pages/PlayerDetail';
import CalendarPage from './pages/CalendarPage';
import TrainingsPage from './pages/TrainingsPage';
import PublicTeamSchedule from './pages/PublicTeamSchedule';
import PublicLanding from './pages/PublicLanding';
import ClubLanding from './pages/ClubLanding';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';

// Определяем тип хоста по window.location:
//   * mobile.legirus.sportdata.tech → public-приложение для родителей (PublicLanding)
//   * legirus.sportdata.tech         → клубная платформа (ClubLanding → /login → /club)
//   * preview/local                   → public по умолчанию (для удобства разработки)
function isClubHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'legirus.sportdata.tech' || h === 'www.legirus.sportdata.tech';
}

// Корневой роут (/) — выбираем что показывать в зависимости от домена и авторизации.
function RootRoute() {
  const { user } = useAuth();
  if (isClubHost()) {
    // На клубном домене: залогинен → /club, нет → ClubLanding (выбор роли)
    if (user) return <Navigate to="/club" replace />;
    return <ClubLanding />;
  }
  // На mobile.* (или dev/preview) — родительский лендинг с выбором команды
  return <PublicLanding />;
}

// Guard: страница доступна только тренерам. Игроков редиректит на свой
// профиль (если есть playerId) или на /club.
// Используется для ClubOverview, ComparisonView, PlayersLeaders,
// PlayersRating — там показываются данные ДРУГИХ игроков (топы,
// рейтинги, MOTM), что нарушает контракт «игрок видит только себя».
function CoachOnly({ children }) {
  const { isCoach, isPlayer, user } = useAuth();
  if (isCoach) return children;
  if (isPlayer && user?.playerId) {
    return <Navigate to={`/players/${user.playerId}`} replace />;
  }
  return <Navigate to="/club" replace />;
}

// Player-detail guard: игрок может смотреть только свой профиль.
// Бэк уже отдаёт 403 на чужого, но фронт прыгает на свою страницу,
// чтобы не показывать ошибку.
function OwnPlayerOnly({ children }) {
  const { isPlayer, user } = useAuth();
  const { playerId: routePlayerId } = useParams();
  if (isPlayer && user?.playerId && routePlayerId !== user.playerId) {
    return <Navigate to={`/players/${user.playerId}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* Vercel Analytics — pageviews и custom events. Без cookies, без PII. */}
      <Analytics />
      {/* Vercel Speed Insights — Core Web Vitals (LCP, CLS, INP) с реальных пользователей. */}
      <SpeedInsights />
      {/* Глобальный host для toast-уведомлений (toast.success/error/info). */}
      <ToastHost />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <TeamProvider>
            <TournamentProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<RootRoute />} />
              <Route path="/public" element={<PublicLanding />} />
              <Route path="/public/team/:age" element={<PublicTeamSchedule />} />
              <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/club" element={<ClubPage />} />
                {/* Командная аналитика и сравнение — coach-only.
                    Игрок видит только себя по контракту, не должен иметь
                    доступ к MOTM/топам/рейтингам других игроков. */}
                <Route path="/analytics" element={<CoachOnly><ClubOverview /></CoachOnly>} />
                <Route path="/analytics/team" element={<CoachOnly><ComparisonView /></CoachOnly>} />
                <Route path="/matches" element={<MatchesDashboard />} />
                <Route path="/matches/:matchId" element={<MatchDetail />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/trainings" element={<TrainingsPage />} />
                {/* Топы и рейтинги команды — coach-only. */}
                <Route path="/players" element={<CoachOnly><PlayersLeaders /></CoachOnly>} />
                <Route path="/players/rating" element={<CoachOnly><PlayersRating /></CoachOnly>} />
                {/* Профиль игрока: тренер — любого, игрок — только себя. */}
                <Route path="/players/:playerId" element={<OwnPlayerOnly><PlayerDetail /></OwnPlayerOnly>} />
                <Route path="*" element={<Navigate to="/club" replace />} />
              </Route>
            </Routes>
            </TournamentProvider>
          </TeamProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
