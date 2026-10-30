import { buildHealthUrl } from './health.ts';
import type { ComputerConnection } from '../store/useComputerConnection';

export class PairingError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export async function checkComputerPairing(connection: ComputerConnection, timeoutMs = 5000): Promise<void> {
  const url = buildHealthUrl(connection.address);
  if (!url) throw new PairingError('address', '请输入电脑的局域网 IP 和端口。');
  if (!/^[a-f0-9]{32}$/i.test(connection.token.trim())) throw new PairingError('auth', '请输入电脑终端当前显示的完整配对码。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const health = await fetch(url, { signal: controller.signal });
    const body = await health.json();
    if (!health.ok || body?.service !== 'lingonest-local-server' || body.status !== 'ok' || body.mode !== 'lan-backup') {
      throw new PairingError('mode', '电脑服务尚未启用局域网备份/配对模式，请检查启动方式。');
    }
    const response = await fetch(url.replace(/\/health$/, '/ai/status'), {
      headers: { authorization: `Bearer ${connection.token.trim()}` }, signal: controller.signal,
    });
    if (response.status === 401) throw new PairingError('auth', '配对码不正确或已过期，请使用电脑终端当前显示的配对码。');
    const result = await response.json();
    if (!response.ok || !['disabled', 'misconfigured', 'configured'].includes(result?.status)) {
      throw new PairingError('server', '电脑返回异常，请检查服务版本和启动信息。');
    }
  } catch (cause) {
    if (cause instanceof PairingError) throw cause;
    throw new PairingError('network', controller.signal.aborted ? '连接电脑超时，请检查网络。' : '无法连接电脑，请检查地址、网络和后端。');
  } finally { clearTimeout(timer); }
}
