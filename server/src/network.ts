import { isIP } from 'node:net';

export function isPrivateLanIpv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const [first, second] = value.split('.').map(Number);
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}
