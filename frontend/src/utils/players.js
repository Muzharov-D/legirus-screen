// Map shortName from formation/match-001 ("В. Воронков") -> playerId from players.json.
// Uses lastName + firstName initial. Fallback: search by lastName only.
export function findPlayerByShortName(shortName, playersList) {
  if (!shortName || !playersList) return null;
  // forms: "В. Воронков" or "Воронков В."
  const cleanName = shortName.replace(/\./g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const a = parts[0];
  const b = parts[1];
  // initial.surname
  const isInitialFirst = a.length === 1;
  const initial = isInitialFirst ? a : b;
  const surname = isInitialFirst ? b : a;
  const surnameLower = surname.toLowerCase();
  return (
    playersList.find(
      (p) =>
        p.lastName.toLowerCase() === surnameLower &&
        p.firstName.charAt(0).toLowerCase() === initial.toLowerCase()
    ) || playersList.find((p) => p.lastName.toLowerCase() === surnameLower) || null
  );
}

export function findPlayerByNumber(number, playersList) {
  return playersList.find((p) => p.number === number) || null;
}

export function getInitials(first, last) {
  const f = (first || '').charAt(0).toUpperCase();
  const l = (last || '').charAt(0).toUpperCase();
  return `${f}${l}`;
}
