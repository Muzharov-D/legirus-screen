// Модалка с инструкцией подписки на iCal feed.
// Показывает URL подписки + кнопки для iOS/Android/Google + копирование URL.

import { useEffect, useState } from 'react';
import './CalendarSubscribeModal.css';

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh/.test(ua)) return 'mac';
  return 'desktop';
}

export default function CalendarSubscribeModal({ feedUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState('desktop');

  useEffect(() => {
    setPlatform(detectPlatform());
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // webcal:// — стандартная схема для подписки на ICS-feed.
  // iOS Calendar / macOS Calendar / Android (через Google Calendar Web → mobile sync)
  // открывают её и предлагают добавить подписку.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

  // Google Calendar — отдельный link для добавления через web (с дальнейшим sync на Android)
  const googleUrl = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(feedUrl);

  function copy() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="csm-backdrop" onClick={onClose}>
      <div className="csm-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="csm-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="csm-icon">📅</div>
        <h2 className="csm-title">Расписание в твой календарь</h2>
        <p className="csm-subtitle">
          Подпишись один раз — и матчи будут появляться в календаре телефона
          автоматически. Когда меняется время или добавляется новый матч —
          календарь обновится сам.
        </p>

        <div className="csm-actions">
          {platform === 'ios' && (
            <a className="csm-btn csm-btn--primary" href={webcalUrl}>
              <span>📲</span><span>Открыть в Календаре iPhone</span>
            </a>
          )}
          {platform === 'mac' && (
            <a className="csm-btn csm-btn--primary" href={webcalUrl}>
              <span>📲</span><span>Открыть в Календаре Mac</span>
            </a>
          )}
          {platform === 'android' && (
            <a className="csm-btn csm-btn--primary" href={googleUrl} target="_blank" rel="noreferrer">
              <span>📲</span><span>Добавить в Google Calendar</span>
            </a>
          )}
          {platform === 'desktop' && (
            <>
              <a className="csm-btn csm-btn--primary" href={googleUrl} target="_blank" rel="noreferrer">
                <span>📲</span><span>Добавить в Google Calendar</span>
              </a>
              <a className="csm-btn csm-btn--secondary" href={webcalUrl}>
                <span>📲</span><span>Открыть в системном календаре</span>
              </a>
            </>
          )}
        </div>

        <div className="csm-divider"><span>или вручную</span></div>

        <div className="csm-url-row">
          <input
            className="csm-url"
            value={feedUrl}
            readOnly
            onClick={(e) => e.target.select()}
          />
          <button className="csm-copy" onClick={copy}>
            {copied ? '✓ Скопировано' : 'Копировать'}
          </button>
        </div>

        <details className="csm-help">
          <summary>Инструкция по платформам</summary>
          <div className="csm-help-content">
            <h4>📱 iPhone</h4>
            <p>Настройки → Календарь → Учётные записи → Добавить учётную запись → Другое → «Подписка на календарь» → вставь URL.</p>
            <h4>🤖 Android (Google Calendar)</h4>
            <p>Открой <b>calendar.google.com</b> на компьютере → ➕ слева → «Из URL» → вставь URL → Добавить. На телефоне Android появится автоматически после синхронизации.</p>
            <h4>💻 macOS Calendar</h4>
            <p>Файл → Новая подписка на календарь → вставь URL.</p>
            <h4>📅 Outlook</h4>
            <p>Календарь → Добавить календарь → Подписаться из интернета → URL.</p>
          </div>
        </details>

        <div className="csm-footer">
          ⓘ Календарь публичный, без логина. Если ссылку придётся отозвать —
          обнови сезон в админке клуба.
        </div>
      </div>
    </div>
  );
}
