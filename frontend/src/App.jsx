import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { Analytics } from '@vercel/analytics/react';
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

export default function App() {
  return (
    <ErrorBoundary>
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
                <Route path="/analytics" element={<ClubOverview />} />
                <Route path="/analytics/team" element={<ComparisonView />} />
                <Route path="/matches" element={<MatchesDashboard />} />
                <Route path="/matches/:matchId" element={<MatchDetail />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/trainings" element={<TrainingsPage />} />
                <Route path="/players" element={<PlayersLeaders />} />
                <Route path="/players/rating" element={<PlayersRating />} />
                <Route path="/players/:playerId" element={<PlayerDetail />} />
                <Route path="*" element={<Navigate to="/club" replace />} />
              </Route>
            </Routes>
            </TournamentProvider>
          </TeamProvider>
        </AuthProvider>
        <Analytics />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
