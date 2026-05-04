import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
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
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TeamProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/" element={<Navigate to="/club" replace />} />
                <Route path="/club" element={<ClubPage />} />
                <Route path="/analytics" element={<ClubOverview />} />
                <Route path="/analytics/team" element={<ComparisonView />} />
                <Route path="/matches" element={<MatchesDashboard />} />
                <Route path="/matches/:matchId" element={<MatchDetail />} />
                <Route path="/players" element={<PlayersLeaders />} />
                <Route path="/players/rating" element={<PlayersRating />} />
                <Route path="/players/:playerId" element={<PlayerDetail />} />
                <Route path="*" element={<Navigate to="/club" replace />} />
              </Route>
            </Routes>
          </TeamProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
