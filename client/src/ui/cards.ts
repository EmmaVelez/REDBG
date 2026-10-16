import type { CardDef, CardInstance, GameState } from '@re/game-core';

/**
 * Shared card helpers for the UI. Everything resolves through the state's
 * instance -> def index (the server sanitizes views, so only MY cards carry
 * real ids; the helper is defensive about missing lookups for hidden zones).
 */

/** Resolve an instance id to its static definition, or null when hidden/unknown. */
export function defForInstance(state: GameState, instanceId: string | undefined): CardDef | null {
  if (instanceId === undefined) return null;
  const inst: CardInstance | undefined = state.cards[instanceId];
  if (inst === undefined) return null;
  const def: CardDef | undefined = state.cardDefs[inst.cardId];
  return def ?? null;
}

/** Human label for a card type (used as the frame banner). */
export function typeLabel(t: CardDef['type']): string {
  switch (t) {
    case 'character':
      return 'CHARACTER';
    case 'weapon':
      return 'WEAPON';
    case 'ammunition':
      return 'AMMO';
    case 'item':
      return 'ITEM';
    case 'action':
      return 'ACTION';
    case 'token':
      return 'TOKEN';
    case 'infected':
      return 'INFECTED';
  }
}

/** css class per type for the placeholder frame. */
export function typeClass(t: CardDef['type']): string {
  switch (t) {
    case 'character':
      return 'card-character';
    case 'weapon':
      return 'card-weapon';
    case 'ammunition':
      return 'card-ammo';
    case 'item':
      return 'card-item';
    case 'action':
      return 'card-action';
    case 'token':
      return 'card-token';
    case 'infected':
      return 'card-infected';
  }
}

/** Short stat line: weapons show damage + ammo req, infected show HP + attack. */
export function statLine(def: CardDef): string {
  if (def.type === 'weapon') {
    const dmg = def.damage ?? 0;
    const ammo = def.ammoReq ?? 0;
    return `DMG ${dmg}${ammo > 0 ? ` · AMMO ${ammo}` : ''}`;
  }
  if (def.type === 'infected') {
    return `HP ${def.hp ?? 0} · ATK ${def.attack ?? 0}`;
  }
  if (def.type === 'character' && def.maxHp !== undefined) {
    return `MAX HP ${def.maxHp}`;
  }
  return '';
}

/** Bonus icons rendered as a compact string (from the machine-readable data). */
export function bonusLine(def: CardDef): string {
  const b = def.bonuses;
  if (b === undefined) return '';
  const parts: string[] = [];
  if (b.cards !== undefined) parts.push(`+${b.cards} Cards`);
  if (b.gold !== undefined) parts.push(`+${b.gold} Gold`);
  if (b.ammo !== undefined) parts.push(`+${b.ammo} Ammo`);
  if (b.buys !== undefined) parts.push(`+${b.buys} Buy`);
  if (b.actions !== undefined) parts.push(`+${b.actions} Action`);
  if (b.explores !== undefined) parts.push(`+${b.explores} Explore`);
  return parts.join(' · ');
}

/** Cost to display: undefined (not purchasable) renders as '—'. */
export function costText(def: CardDef): string {
  return def.cost === undefined ? '—' : String(def.cost);
}