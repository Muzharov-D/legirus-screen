// Кнопка-toggle для PWA push-уведомлений.
// Состояния: not-supported / off / on / loading / error
// Минимальный UI: иконка-колокольчик с цветовым индикатором.

import { useEffect, useState } from 'react';
import {
  pushSupported,
  requestAndSubscribe,
  unsubscribe,
  checkExistingSubscription,
} from '../services/push';
import PushPreferencesPanel from './PushPreferencesPanel';
import './PushOptInButton.css';

export default function PushOptInButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    if (!pushSupported()) return;
    checkExistingSubscription().then((sub) => setSubscribed(!!sub));
  }, []);

  if (!supported) return null;

  async function toggle() {
    setError('');
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribe();
        setSubscribed(false);
      } else {
        await requestAndSubscribe();
        setSubscribed(true);
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const title = subscribed
    ? 'Push-уведомления включены — нажмите чтобы отключить'
    : 'Включить push-уведомления о новых матчах';

  return (
    <span className="push-opt-group">
      <button
        className={`push-opt-btn ${subscribed ? 'push-opt-btn--on' : ''}`}
        onClick={toggle}
        disabled={busy}
        title={error || title}
        aria-label={title}
      >
        <span className="push-opt-btn__icon">{subscribed ? '🔔' : '🔕'}</span>
        {error && <span className="push-opt-btn__dot" aria-hidden="true">!</span>}
      </button>
      {subscribed && (
        <button
          type="button"
          className="push-opt-btn push-opt-btn--gear"
          onClick={() => setPrefsOpen(true)}
          aria-label="Настройки уведомлений"
          title="Настройки уведомлений"
        >
          <span className="push-opt-btn__icon">⚙</span>
        </button>
      )}
      {prefsOpen && <PushPreferencesPanel onClose={() => setPrefsOpen(false)} />}
    </span>
  );
}
