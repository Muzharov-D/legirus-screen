import { useMemo, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import SidebarNav from '../components/SidebarNav';
import AgentTriggerButton from '../components/AgentTriggerButton';
import AgentCard from '../components/AgentCard';

function detectScreen(pathname) {
  if (pathname === '/analytics' || pathname === '/') return 'analytics-overview';
  if (pathname.startsWith('/analytics/team')) return 'comparison';
  if (/^\/matches\/[^/]+/.test(pathname)) return 'match-detail';
  if (pathname.startsWith('/matches')) return 'matches-overview';
  if (/^\/players\/[^/]+/.test(pathname)) return 'players-detail';
  if (pathname.startsWith('/players')) return 'players-leaders';
  return 'analytics-overview';
}

function extractIds(pathname) {
  const m1 = pathname.match(/^\/matches\/([^/?]+)/);
  const m2 = pathname.match(/^\/players\/([^/?]+)/);
  return { matchId: m1 ? m1[1] : 'match-001', playerId: m2 ? m2[1] : null };
}

export default function MainLayout() {
  const { pathname } = useLocation();
  const [agentOpen, setAgentOpen] = useState(false);

  const screenId = detectScreen(pathname);
  const ctx = useMemo(() => extractIds(pathname), [pathname]);

  return (
    <div className="app-layout">
      <AppHeader />
      <div className="app-body">
        <SidebarNav />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <AgentTriggerButton onClick={() => setAgentOpen(true)} />
      {agentOpen && (
        <AgentCard
          screenId={screenId}
          context={ctx}
          onClose={() => setAgentOpen(false)}
        />
      )}
    </div>
  );
}
