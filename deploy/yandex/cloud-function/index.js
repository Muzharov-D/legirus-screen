// Yandex Cloud Function — прокси /api/* на Render.
// Триггер: HTTP. Публикуется через API Gateway или CDN с path-pattern /api/*.
//
// Зачем: фронт не должен ходить напрямую на legirus-api.onrender.com (заблокирован у мобильных
// операторов в РФ). Function хостится в Yandex DC (Москва), к Render идёт server-to-server,
// что TSPU не блокирует, а клиенту отдаёт ответ с российского IP.
//
// Минимальный код, без зависимостей — Node.js 20 имеет fetch из коробки.

const RENDER_BASE = 'https://legirus-api.onrender.com';

exports.handler = async function (event) {
  // Yandex Cloud Function HTTP trigger event-format:
  //   event.httpMethod, event.path, event.queryStringParameters, event.headers, event.body, event.isBase64Encoded
  const method = event.httpMethod || 'GET';
  const rawPath = event.path || event.url || '/';
  const qs = event.queryStringParameters || {};

  // Собираем query string
  const qsString = Object.keys(qs).length
    ? '?' + new URLSearchParams(qs).toString()
    : '';

  const targetUrl = RENDER_BASE + rawPath + qsString;

  // Чистим заголовки от Yandex-специфичных
  const incomingHeaders = event.headers || {};
  const forwardedHeaders = {};
  for (const [k, v] of Object.entries(incomingHeaders)) {
    const lower = k.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'x-forwarded-for' ||
      lower === 'x-forwarded-host' ||
      lower === 'x-forwarded-proto' ||
      lower.startsWith('x-yandex-') ||
      lower.startsWith('x-yc-') ||
      lower === 'content-length'
    ) continue;
    forwardedHeaders[k] = v;
  }
  forwardedHeaders['Host'] = 'legirus-api.onrender.com';
  forwardedHeaders['X-Forwarded-For'] = incomingHeaders['x-forwarded-for'] || incomingHeaders['X-Forwarded-For'] || '';
  forwardedHeaders['X-Forwarded-Proto'] = 'https';

  const fetchOpts = {
    method,
    headers: forwardedHeaders,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD' && event.body != null) {
    fetchOpts.body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
  }

  let response;
  try {
    response = await fetch(targetUrl, fetchOpts);
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'upstream_unreachable', message: err.message }),
    };
  }

  // Выходные заголовки — пропускаем как есть, кроме hop-by-hop
  const outHeaders = {};
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'connection' ||
      lower === 'transfer-encoding' ||
      lower === 'keep-alive' ||
      lower === 'content-length'
    ) return;
    outHeaders[key] = value;
  });

  // Тело — определяем бинарность по content-type
  const contentType = (outHeaders['content-type'] || outHeaders['Content-Type'] || '').toLowerCase();
  const isText = /^(text\/|application\/(json|javascript|xml|manifest|ld\+json)|image\/svg)/.test(contentType);

  if (isText) {
    const text = await response.text();
    return {
      statusCode: response.status,
      headers: outHeaders,
      body: text,
      isBase64Encoded: false,
    };
  } else {
    const buf = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: response.status,
      headers: outHeaders,
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  }
};
