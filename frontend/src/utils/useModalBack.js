// Hook: Android back-button и swipe-back закрывают модалку, а не страницу.
// Открытие модалки → pushState; popstate (back/swipe) → onClose;
// Закрытие через крестик → cleanup делает history.back() для синхронизации.

import { useEffect } from 'react';

export default function useModalBack(onClose, isOpen = true) {
  useEffect(() => {
    if (!isOpen) return;
    let closedByBack = false;
    // Маркер чтобы отличить нашу history-entry от существующих
    window.history.pushState({ legirusModal: true, ts: Date.now() }, '');

    const onPop = () => {
      closedByBack = true;
      // Защита от двойного onClose: cleanup проверит флаг
      if (typeof onClose === 'function') onClose();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // Если модалка закрылась через крестик/Escape/клик-по-фону — синхронизируем history,
      // чтобы back из основной страницы ещё работал нормально
      if (!closedByBack && window.history.state?.legirusModal) {
        try { window.history.back(); } catch {}
      }
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}
