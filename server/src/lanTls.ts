import { X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SecureContextOptions } from 'node:tls';
import { isPrivateLanIpv4 } from './network.js';

export function readLanTlsOptions(ip: string, serverRoot: string): SecureContextOptions {
  if (!isPrivateLanIpv4(ip)) throw new Error('LAN HTTPS requires a private IPv4 address');
  const directory = resolve(serverRoot, 'data', 'tls');
  let key: Buffer;
  let cert: Buffer;
  try {
    key = readFileSync(resolve(directory, 'server.key'));
    cert = readFileSync(resolve(directory, 'server.pem'));
  } catch {
    throw new Error('LAN TLS certificate missing. Run npm.cmd run tls:generate -- <LAN IP> first.');
  }
  const certificate = new X509Certificate(cert);
  if (!certificate.checkIP(ip)) throw new Error('LAN TLS certificate does not match LINGONEST_LAN_IP. Regenerate it for this IP.');
  if (!certificate.checkPrivateKey(createPrivateKey(key))) throw new Error('LAN TLS certificate and private key do not match');
  if (Date.parse(certificate.validTo) <= Date.now()) throw new Error('LAN TLS certificate expired. Regenerate it.');
  return { key, cert };
}
