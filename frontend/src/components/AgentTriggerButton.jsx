import './AgentTriggerButton.css';

export default function AgentTriggerButton({ onClick }) {
  return (
    <button className="agent-trigger" onClick={onClick} title="ИИ-агент">
      <span className="agent-trigger__bolt">✦</span>
      <span>ИИ-агент</span>
    </button>
  );
}
