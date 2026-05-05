import { Outlet } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import SidebarNav from '../components/SidebarNav';

// ИИ-агент временно убран из UI: заглушка с хардкодом на 2010,
// без реального LLM. Файлы AgentCard / AgentTriggerButton / agent-rules.json
// и backend-route /api/agent/insight оставлены — вернём когда подключим LLM.

export default function MainLayout() {
  return (
    <div className="app-layout">
      <AppHeader />
      <div className="app-body">
        <SidebarNav />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
