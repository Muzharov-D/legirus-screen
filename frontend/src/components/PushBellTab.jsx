// Per-team bell — компактная кнопка включения/выключения пушей для конкретной
// возрастной группы. Живёт внутри таба команды в PublicTeamHeader.
// stopPropagation() на клике — чтобы не триггерить tab navigation.

import { useEffect, useState } from 'react';
import {
  pushSupported,
  requestAndSubscribePublic,
  unsubscribePublicAge,
  isSubscribedToAgePublic,
} from '../services/push';
import './PushBellTab.css';

export default function PushBellTab({ age }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setSupported(true);
    let cancelled = false;
    isSubscribedToAgePublic(age).then((res) => {
      if (!cancelled) setSubscribed(!!res.subscribed);
    });
    return () => { cancelled = true; };
  }, [age]);

  if (!supported) return null;

  async function onClick(e) {
    e.stopPropagation(); // не переключать таб
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribePublicAge(age);
        setSubscribed(false);
      } else {
        await requestAndSubscribePublic(age);
        setSubscribed(true);
      }
    } catch (_) {
      // тихо игнорируем — пользователь может не выдать permission
    } finally {
      setBusy(false);
    }
  }

  return (
    <span
      role="button"
      tabIndex={-1}
      className={`push-bell-tab${subscribed ? ' push-bell-tab--on' : ''}${busy ? ' push-bell-tab--busy' : ''}`}
      onClick={onClick}
      aria-label={subscribed ? 'Отключить уведомления для команды' : 'Включить уведомления для команды'}
      title={subscribed ? 'Уведомления включены — клик отключит' : 'Включить уведомления'}
    >
      {subscribed ? '🔔' : '🔕'}
    </span>
  );
}
