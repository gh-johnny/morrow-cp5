import { describe, expect, it } from 'vitest';
import { birthDateSchema, messageInputSchema, preferencesDefault } from '../shared/contracts';
import { directConversationId, focusRemaining, isQuietTime, radarSignals, resolveRecipients, retryDelay, validateCapacity } from '../shared/domain';

describe('conversation identity and capacity', () => {
  it('uses the same ID in either order and avoids delimiter collisions', () => {
    expect(directConversationId('a', 'b')).toBe(directConversationId('b', 'a'));
    expect(directConversationId('a_b', 'c')).not.toBe(directConversationId('a', 'b_c'));
    expect(() => directConversationId('a', 'a')).toThrow();
  });
  it('counts the owner exactly once and rejects over-capacity or fractional limits', () => {
    expect(validateCapacity(['a', 'b', 'b'], 2, 'a')).toEqual(['a', 'b']);
    expect(() => validateCapacity(['b', 'c'], 2, 'a')).toThrow('vagas');
    expect(() => validateCapacity(['b'], 2.5, 'a')).toThrow();
    expect(() => validateCapacity([], 2, 'a')).toThrow('dois');
  });
});
describe('push policy and personal preferences', () => {
  const members = ['a', 'b', 'c'];
  it('excludes the sender, strangers and duplicate mentions', () => {
    expect(resolveRecipients('all_group_messages', members, 'a', [], 'group')).toEqual(['b', 'c']);
    expect(resolveRecipients('mentioned_members', members, 'a', ['a', 'b', 'b', 'stranger'], 'group')).toEqual(['b']);
    expect(resolveRecipients('direct_messages_only', members, 'a', ['b'], 'group')).toEqual([]);
    expect(resolveRecipients('direct_messages_only', ['a', 'b'], 'a', [], 'direct')).toEqual(['b']);
    expect(resolveRecipients('disabled', members, 'a', [], 'direct')).toEqual([]);
  });
  it('handles quiet hours across midnight and a fixed timezone offset', () => {
    const p = { ...preferencesDefault, quietEnabled: true, utcOffsetMinutes: -180 };
    expect(isQuietTime(p, Date.parse('2026-10-02T02:00:00Z'))).toBe(true);
    expect(isQuietTime(p, Date.parse('2026-10-02T15:00:00Z'))).toBe(false);
    expect(isQuietTime(p, Date.parse('2026-10-02T10:00:00Z'))).toBe(false);
  });
});
describe('input integrity and recovery', () => {
  it('rejects impossible dates and empty messages', () => {
    expect(birthDateSchema.safeParse('2001-02-30').success).toBe(false);
    expect(birthDateSchema.safeParse('2000-02-29').success).toBe(true);
    expect(messageInputSchema.safeParse({ id: 'm1', text: '   ' }).success).toBe(false);
    expect(messageInputSchema.safeParse({ id: 'm1', text: 'Hello' }).success).toBe(true);
  });
  it('bounds retries and preserves a paused timer', () => {
    expect(retryDelay(2, 0.5)).toBe(4000);
    expect(retryDelay(100, 0.5)).toBe(120_000);
    expect(focusRemaining({ durationSeconds: 1500, startedAt: 0, state: 'paused', remainingAtPause: 400 }, 900_000)).toBe(400);
  });
  it('does not flag an answered question', () => {
    expect(radarSignals([], [], Date.now())).toEqual([]);
  });
});
