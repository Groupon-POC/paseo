// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a hub Mac's sealed pairing carries.

/**
 * What the hand seals on a Mac's hub row (the monorepo's `packages/groupon-cli/src/hand/paseo/relay.ts`,
 * `sealPairingOffer`): the daemon's offer URL and its password. Paseo 0.13 admits a relay client
 * only with the daemon's password (it dropped `COMPAT(relayPasswordOptional)`), so the window adds
 * the host with both. A hand from before 2026-10-26 sealed the offer URL alone, which still opens
 * here with no password.
 */
export interface SealedPairing {
  offerUrl: string;
  password: string | null;
}

/** The sealed pairing's JSON version; anything that is not JSON is an older hand's bare offer URL. */
const SEALED_PAIRING_VERSION = 1;

/** The pairing in an opened seal; null when it is JSON this window cannot read. */
export function readSealedPairing(opened: string): SealedPairing | null {
  if (!opened.startsWith("{")) return { offerUrl: opened, password: null };
  let body: unknown;
  try {
    body = JSON.parse(opened);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (record.v !== SEALED_PAIRING_VERSION || typeof record.offerUrl !== "string") return null;
  return {
    offerUrl: record.offerUrl,
    password: typeof record.password === "string" ? record.password : null,
  };
}
