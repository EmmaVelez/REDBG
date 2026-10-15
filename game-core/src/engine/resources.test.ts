import { describe, it, expect } from 'vitest';
import { gainAmmo, spendAmmo, canAffordAmmo, gainXp, spendXp, canAffordXp, damageCharacter, healCharacter, isDown } from './resources';
import type { Resources, HpTracker } from './resources';

describe('resources', () => {
  describe('gainAmmo', () => {
    it('returns new object; original unchanged', () => {
      const res: Resources = { ammo: 10, xp: 0 };
      const newRes = gainAmmo(res, 5);
      expect(newRes).not.toBe(res);
      expect(newRes.ammo).toBe(15);
      expect(res.ammo).toBe(10);
    });

    it('throws on -1', () => {
      const res: Resources = { ammo: 10, xp: 0 };
      expect(() => gainAmmo(res, -1)).toThrow('gainAmmo: negative amount');
    });
  });

  describe('spendAmmo', () => {
    it('success decrements', () => {
      const res: Resources = { ammo: 10, xp: 0 };
      const newRes = spendAmmo(res, 5);
      expect(newRes.ammo).toBe(5);
    });

    it('throws on insufficient (ammo 3, spend 5)', () => {
      const res: Resources = { ammo: 3, xp: 0 };
      expect(() => spendAmmo(res, 5)).toThrow('spendAmmo: insufficient ammo');
    });

    it('throws on -1', () => {
      const res: Resources = { ammo: 10, xp: 0 };
      expect(() => spendAmmo(res, -1)).toThrow('spendAmmo: negative amount');
    });
  });

  describe('canAffordAmmo', () => {
    it('true/false cases including negative amount -> false', () => {
      const res: Resources = { ammo: 10, xp: 0 };
      expect(canAffordAmmo(res, 5)).toBe(true);
      expect(canAffordAmmo(res, 15)).toBe(false);
      expect(canAffordAmmo(res, -1)).toBe(false);
    });
  });

  describe('gainXp', () => {
    it('success', () => {
      const res: Resources = { ammo: 0, xp: 10 };
      const newRes = gainXp(res, 5);
      expect(newRes.xp).toBe(15);
    });

    it('throws on -1', () => {
      const res: Resources = { ammo: 0, xp: 10 };
      expect(() => gainXp(res, -1)).toThrow('gainXp: negative amount');
    });
  });

  describe('spendXp', () => {
    it('success', () => {
      const res: Resources = { ammo: 0, xp: 15 };
      const newRes = spendXp(res, 5);
      expect(newRes.xp).toBe(10);
    });

    it('throws on insufficient (xp 3, spend 5)', () => {
      const res: Resources = { ammo: 0, xp: 3 };
      expect(() => spendXp(res, 5)).toThrow('spendXp: insufficient xp');
    });

    it('throws on -1', () => {
      const res: Resources = { ammo: 0, xp: 10 };
      expect(() => spendXp(res, -1)).toThrow('spendXp: negative amount');
    });
  });

  describe('canAffordXp', () => {
    it('true/false cases including negative amount -> false', () => {
      const res: Resources = { ammo: 0, xp: 10 };
      expect(canAffordXp(res, 5)).toBe(true);
      expect(canAffordXp(res, 15)).toBe(false);
      expect(canAffordXp(res, -1)).toBe(false);
    });
  });

  describe('damageCharacter', () => {
    it('hp 5 - 2 = 3, killed false', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      const { tracker: newTracker, killed } = damageCharacter(tracker, 'char1', 2);
      expect(newTracker.hp.char1).toBe(3);
      expect(killed).toBe(false);
    });

    it('hp 3 - 3 = 0, killed true', () => {
      const tracker: HpTracker = { hp: { char1: 3 } };
      const { tracker: newTracker, killed } = damageCharacter(tracker, 'char1', 3);
      expect(newTracker.hp.char1).toBe(0);
      expect(killed).toBe(true);
    });

    it('hp 0 damaged again stays 0, killed false', () => {
      const tracker: HpTracker = { hp: { char1: 0 } };
      const { tracker: newTracker, killed } = damageCharacter(tracker, 'char1', 1);
      expect(newTracker.hp.char1).toBe(0);
      expect(killed).toBe(false);
    });

    it('hp never negative (5 - 9 = 0)', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      const { tracker: newTracker, killed } = damageCharacter(tracker, 'char1', 9);
      expect(newTracker.hp.char1).toBe(0);
      expect(killed).toBe(true);
    });

    it('throws for amount 0', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      expect(() => damageCharacter(tracker, 'char1', 0)).toThrow('damageCharacter: amount must be positive');
    });

    it('throws for amount -1', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      expect(() => damageCharacter(tracker, 'char1', -1)).toThrow('damageCharacter: amount must be positive');
    });

    it('throws for unknown instanceId', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      expect(() => damageCharacter(tracker, 'char2', 1)).toThrow('damageCharacter: unknown character: char2');
    });

    it('does not mutate the input tracker', () => {
      const tracker: HpTracker = { hp: { char1: 5 } };
      damageCharacter(tracker, 'char1', 2);
      expect(tracker.hp.char1).toBe(5);
    });
  });

  describe('healCharacter', () => {
    it('2 healed by 3 with maxHp 5 -> 5 (cap)', () => {
      const tracker: HpTracker = { hp: { char1: 2 } };
      const newTracker = healCharacter(tracker, 'char1', 3, 5);
      expect(newTracker.hp.char1).toBe(5);
    });

    it('throws negative amount', () => {
      const tracker: HpTracker = { hp: { char1: 2 } };
      expect(() => healCharacter(tracker, 'char1', -1, 5)).toThrow('healCharacter: negative amount');
    });

    it('throws maxHp 0', () => {
      const tracker: HpTracker = { hp: { char1: 2 } };
      expect(() => healCharacter(tracker, 'char1', 1, 0)).toThrow('healCharacter: maxHp must be positive');
    });

    it('throws unknown id', () => {
      const tracker: HpTracker = { hp: { char1: 2 } };
      expect(() => healCharacter(tracker, 'char2', 1, 5)).toThrow('healCharacter: unknown character: char2');
    });
  });

  describe('isDown', () => {
    it('false at hp 3', () => {
      const tracker: HpTracker = { hp: { char1: 3 } };
      expect(isDown(tracker, 'char1')).toBe(false);
    });

    it('true at hp 0', () => {
      const tracker: HpTracker = { hp: { char1: 0 } };
      expect(isDown(tracker, 'char1')).toBe(true);
    });

    it('throws unknown id', () => {
      const tracker: HpTracker = { hp: { char1: 0 } };
      expect(() => isDown(tracker, 'char2')).toThrow('isDown: unknown character: char2');
    });
  });
});
