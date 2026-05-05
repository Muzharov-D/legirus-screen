// Скрипт генерации VAPID-ключей для Web Push.
// Запуск:  node backend/scripts/generate-vapid-keys.js
// Или:     npx web-push generate-vapid-keys
//
// Результат записать в .env (backend) и в .env (frontend, только public):
//   backend/.env:
//     VAPID_PUBLIC_KEY=...
//     VAPID_PRIVATE_KEY=...
//     VAPID_SUBJECT=mailto:owner@avandata.local
//   frontend/.env:
//     VITE_VAPID_PUBLIC_KEY=...

import('web-push').then((mod) => {
  const webpush = mod.default || mod;
  const keys = webpush.generateVAPIDKeys();
  console.log('=== VAPID Keys ===');
  console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
  console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
  console.log('VAPID_SUBJECT=mailto:admin@avandata.local');
  console.log('');
  console.log('Frontend env:');
  console.log('VITE_VAPID_PUBLIC_KEY=' + keys.publicKey);
}).catch((e) => {
  console.error('Установите web-push: npm install web-push');
  console.error(e.message);
  process.exit(1);
});
