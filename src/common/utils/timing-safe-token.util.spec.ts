import { timingSafeTokenEqual } from './timing-safe-token.util';

describe('timingSafeTokenEqual', () => {
  it('accepts equal tokens', () => {
    expect(timingSafeTokenEqual('same-token', 'same-token')).toBe(true);
  });

  it('rejects different tokens with the same length', () => {
    expect(timingSafeTokenEqual('same-token', 'xxxx-token')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(() => timingSafeTokenEqual('short', 'much-longer')).not.toThrow();
    expect(timingSafeTokenEqual('short', 'much-longer')).toBe(false);
  });

  it('rejects missing tokens', () => {
    expect(timingSafeTokenEqual(undefined, 'token')).toBe(false);
    expect(timingSafeTokenEqual('token', undefined)).toBe(false);
  });
});
