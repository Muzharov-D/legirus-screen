import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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
import WeekPage from './pages/WeekPage';
import PublicTeamSchedule from './pages/PublicTeamSchedule';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

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
              {/* Публичные маршруты — без авторизации */}
              <Route path="/public/team/:age" element={<PublicTeamSchedule />} />
              <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/" element={<Navigate to="/club" replace />} />
                <Route path="/club" element={<ClubPage />} />
                <Route path="/analytics" element={<ClubOverview />} />
                <Route path="/analytics/team" element={<ComparisonView />} />
                <Route path="/matches" element={<MatchesDashboard />} />
                <Route path="/matches/:matchId" element={<MatchDetail />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/trainings" element={<TrainingsPage />} />
                <Route path="/week" element={<WeekPage />} />
                <Route path="/players" element={<PlayersLeaders />} />
                <Route path="/players/rating" element={<PlayersRating />} />
                <Route path="/players/:playerId" element={<PlayerDetail />} />
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
