// Sentry init — должен быть импортирован самым ПЕРВЫМ в server.js
// (до любых других import), чтобы авто-инструментация Express, http и БД сработала.
//
// DSN берём из process.env.SENTRY_DSN. Если переменной нет — Sentry молча
// отключается, ничего не отправляет (удобно для локальной разработки).
import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT
      || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),

    // Performance Monitoring (вариант B): 10% запросов трекаем для performance-метрик.
    // На бесплатном плане Sentry это влезает в квоту 10K transactions/месяц.
    tracesSampleRate: 0.1,

    // sendDefaultPii: true — Sentry собирает IP-адреса, заголовки, query-параметры.
    // Полезно для дебага «какой пользователь и что делал». Если позже встанет вопрос
    // 152-ФЗ или GDPR — поменяй на false.
    sendDefaultPii: true,

    // Отбрасываем известный шум: ошибки которые не помогают дебажить.
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = err?.message || event?.message || '';

      // Сетевые таймауты к ffspb.org — это не наша ошибка, бэкенд просто переживает их.
      if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(msg)) return null;

      // Healthcheck от Render — не интересны.
      if (event?.request?.url?.endsWith('/api/health')) return null;

      return event;
    },

    // Контекст релиза — берём git commit hash из Render (если задан) либо package.json.
    release: process.env.RENDER_GIT_COMMIT || process.env.npm_package_version,
  });

  console.log('[sentry] backend monitoring enabled, env=' + (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'));
} else {
  console.log('[sentry] SENTRY_DSN not set — error tracking disabled');
}

export { Sentry };
