export type HealthResult =
  | { kind: 'ok' }
  | { kind: 'invalid-address' | 'timeout' | 'unreachable' | 'unexpected-response' };

export function buildHealthUrl(address: string): string | null {
  const trimmed = address.trim();
  const match = /^(?:(?:http:\/\/)?)(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(trimmed);
  if (!match) return null;
  const parts = match[1].split('.');
  const octets = parts.map(Number);
  const privateLan = octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
  if (octets.some((octet, index) => octet > 255 || String(octet) !== parts[index]) || !privateLan) return null;
  const port = match[2] ? Number(match[2]) : 3000;
  if (port < 1 || port > 65535) return null;
  return `http://${match[1]}:${port}/health`;
}

export async function checkLocalServer(address: string, timeoutMs = 5000): Promise<HealthResult> {
  const url = buildHealthUrl(address);
  if (!url) return { kind: 'invalid-address' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { kind: 'unexpected-response' };
    const body: unknown = await response.json();
    if (
      typeof body === 'object' && body !== null &&
      'status' in body && body.status === 'ok' &&
      'service' in body && body.service === 'lingonest-local-server' &&
      'mode' in body && (body.mode === 'lan-health-only' || body.mode === 'lan-backup')
    ) return { kind: 'ok' };
    return { kind: 'unexpected-response' };
  } catch {
    return { kind: controller.signal.aborted ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
