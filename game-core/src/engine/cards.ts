import type { CardDef, CardBonuses } from '../types';

export interface BonusSnapshot {
  readonly cards: number;
  readonly gold: number;
  readonly ammo: number;
  readonly buys: number;
  readonly actions: number;
  readonly explores: number;
}

export function sumBonuses(cards: readonly CardDef[]): BonusSnapshot {
  let cardsTotal = 0;
  let gold = 0;
  let ammo = 0;
  let buys = 0;
  let actions = 0;
  let explores = 0;

  for (const card of cards) {
    const bonuses = card.bonuses;
    if (bonuses) {
      cardsTotal += bonuses.cards ?? 0;
      gold += bonuses.gold ?? 0;
      ammo += bonuses.ammo ?? 0;
      buys += bonuses.buys ?? 0;
      actions += bonuses.actions ?? 0;
      explores += bonuses.explores ?? 0;
    }
  }

  return { cards: cardsTotal, gold, ammo, buys, actions, explores };
}

export interface BonusPools {
  readonly turnAmmo: number;
  readonly turnGold: number;
  readonly actionsLeft: number;
  readonly buysLeft: number;
  readonly exploresLeft: number;
}

export function applyBonusPools(pools: BonusPools, bonuses: BonusSnapshot): { readonly pools: BonusPools; readonly draws: number } {
  return {
    pools: {
      turnAmmo: pools.turnAmmo + bonuses.ammo,
      turnGold: pools.turnGold + bonuses.gold,
      actionsLeft: pools.actionsLeft + bonuses.actions,
      buysLeft: pools.buysLeft + bonuses.buys,
      exploresLeft: pools.exploresLeft + bonuses.explores,
    },
    draws: bonuses.cards,
  };
}

export type PromptKind =
  | 'recoverWeaponFromDiscardToHand'
  | 'moveHandCardToTopOfInventory'
  | 'trashHandCard'
  | 'lookAtMansionTop'
  | 'negateWeaponCost40OrLessFromHand'
  | 'healGreenHerb';

export function promptsFor(card: CardDef): readonly PromptKind[] {
  const prompts: PromptKind[] = [];

  const addPrompt = (kind: PromptKind) => {
    if (!prompts.includes(kind)) {
      prompts.push(kind);
    }
  };

  const effects = [
    ...(card.weaponEffects ?? []),
    ...(card.actionEffects ?? []),
    ...(card.itemEffects ?? []),
    ...(card.tokenEffects ?? []),
  ];

  for (const effect of effects) {
    switch (effect.kind) {
      case 'recoverWeaponFromDiscardToHand':
        addPrompt('recoverWeaponFromDiscardToHand');
        break;
      case 'moveHandCardToTopOfInventory':
        addPrompt('moveHandCardToTopOfInventory');
        break;
      case 'trashHandCard':
        addPrompt('trashHandCard');
        break;
      case 'negateWeaponCost40OrLessFromHand':
        addPrompt('negateWeaponCost40OrLessFromHand');
        break;
      case 'lookAtMansionTop':
        addPrompt('lookAtMansionTop');
        break;
      case 'healFixed20OrTrashWithSecondFor60':
        addPrompt('healGreenHerb');
        break;
    }
  }

  return prompts;
}

export function trashDestination(card: CardDef, opts?: { readonly explosivesToDiscard?: boolean }): 'removed' | 'discard' | 'keep' {
  if (card.type === 'item') {
    return 'removed';
  }
  if (card.type === 'token') {
    return 'removed';
  }
  if (card.type === 'weapon' && card.weaponTags?.includes('explosive')) {
    return opts?.explosivesToDiscard ? 'discard' : 'removed';
  }
  return 'keep';
}
