import { useState } from 'react';
import { getInitials } from '../utils/players';
import './PlayerPhoto.css';

export default function PlayerPhoto({ player, size = 64, className = '' }) {
  const [errored, setErrored] = useState(false);
  const photoFile = player?.photo || (player?.id ? `${player.id}.png` : null);
  const src = photoFile ? `/assets/players/${photoFile}` : null;
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
