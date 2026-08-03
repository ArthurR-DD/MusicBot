/** Discord API error codes worth naming specifically. */
const MISSING_PERMISSIONS = 50013;
const MISSING_ACCESS = 50001;

const PERMISSION_ADVICE =
  '❌ Permissions manquantes. Le bot a besoin de `Parler` et `Utiliser le soundboard` ' +
  'dans ce salon (et `Utiliser des sons externes` pour un son d’un autre serveur).';

/**
 * Turn a failure into a message that describes what actually went wrong.
 *
 * Previously every failure here claimed to be a permissions problem, which sent
 * people checking roles that were already correct. Only genuine permission
 * errors say so now; everything else surfaces its own message.
 */
export function describeSoundError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === MISSING_PERMISSIONS || code === MISSING_ACCESS) {
    return PERMISSION_ADVICE;
  }

  // entersState() rejects with an AbortError when the voice connection never
  // becomes Ready.
  if (code === 'ABORT_ERR' || (error instanceof Error && /aborted/i.test(error.message))) {
    return '❌ Le bot n’a pas réussi à se connecter au salon vocal (timeout). Réessaie.';
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `❌ Impossible de jouer ce son : ${detail.slice(0, 300)}`;
}
