import { useState } from 'react';
import { getInitials } from '../utils/players';
import './PlayerPhoto.css';

export default function PlayerPhoto({ player, size = 64, className = '' }) {
  const [errored, setErrored] = useState(false);
  const photoFile = player?.photo || player?.photoUrl || (player?.id ? `${player.id}.png` : null);
  // Поддерживаем оба формата:
  //  — короткое имя файла из /public/assets/players/ (p17-turapin.png)
  //  — абсолютный URL из player-photos.json (https://img.nagradion.ru/...)
  // Раньше всегда префиксили /assets/players/ — URL-ы превращались в /assets/players/https://...
  // и фейлились onError → fallback на инициалы.
  const src = photoFile
    ? (/^https?:\/\//i.test(photoFile) ? photoFile : `/assets/players/${photoFile}`)
    : null;
  const initials = getInitials(player?.firstName, player?.lastName);
  const style = { width: size, height: size };

  if (!src || errored) {
    return (
      <div className={`player-photo player-photo--fallback ${className}`} style={style}>
        <span style={{ fontSize: size * 0.36 }}>{initials || '?'}</span>
      </div>
    );
  }
  return (
    <div className={`player-photo ${className}`} style={style}>
      <img src={src} alt={player?.fullName || ''} onError={() => setErrored(true)} />
    </div>
  );
}
