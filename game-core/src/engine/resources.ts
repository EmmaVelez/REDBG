export interface Resources {
  readonly ammo: number;
  readonly xp: number;
}

export function gainAmmo(res: Resources, amount: number): Resources {
  if (amount < 0) {
    throw new Error('gainAmmo: negative amount');
  }
  return { ...res, ammo: res.ammo + amount };
}

export function spendAmmo(res: Resources, amount: number): Resources {
  if (amount < 0) {
    throw new Error('spendAmmo: negative amount');
  }
  if (res.ammo < amount) {
    throw new Error('spendAmmo: insufficient ammo');
  }
  return { ...res, ammo: res.ammo - amount };
}

export function canAffordAmmo(res: Resources, amount: number): boolean {
  return amount >= 0 && res.ammo >= amount;
}

export function gainXp(res: Resources, amount: number): Resources {
  if (amount < 0) {
    throw new Error('gainXp: negative amount');
  }
  return { ...res, xp: res.xp + amount };
}

export function spendXp(res: Resources, amount: number): Resources {
  if (amount < 0) {
    throw new Error('spendXp: negative amount');
  }
  if (res.xp < amount) {
    throw new Error('spendXp: insufficient xp');
  }
  return { ...res, xp: res.xp - amount };
}

export function canAffordXp(res: Resources, amount: number): boolean {
  return amount >= 0 && res.xp >= amount;
}

export interface HpTracker {
  readonly hp: Readonly<Record<string, number>>;
}

export function damageCharacter(tracker: HpTracker, instanceId: string, amount: number): { tracker: HpTracker; killed: boolean } {
  if (amount <= 0) {
    throw new Error('damageCharacter: amount must be positive');
  }
  if (tracker.hp[instanceId] === undefined) {
    throw new Error('damageCharacter: unknown character: ' + instanceId);
  }
  const prevHp = tracker.hp[instanceId] as number;
  const newHp = Math.max(prevHp - amount, 0);
  const killed = prevHp > 0 && newHp === 0;
  return {
    tracker: { ...tracker, hp: { ...tracker.hp, [instanceId]: newHp } },
    killed,
  };
}

export function healCharacter(tracker: HpTracker, instanceId: string, amount: number, maxHp: number): HpTracker {
  if (amount < 0) {
    throw new Error('healCharacter: negative amount');
  }
  if (maxHp <= 0) {
    throw new Error('healCharacter: maxHp must be positive');
  }
  if (tracker.hp[instanceId] === undefined) {
    throw new Error('healCharacter: unknown character: ' + instanceId);
  }
  const newHp = Math.min((tracker.hp[instanceId] as number) + amount, maxHp);
  return { ...tracker, hp: { ...tracker.hp, [instanceId]: newHp } };
}

export function isDown(tracker: HpTracker, instanceId: string): boolean {
  if (tracker.hp[instanceId] === undefined) {
    throw new Error('isDown: unknown character: ' + instanceId);
  }
  return tracker.hp[instanceId] === 0;
}
