import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = dirname(fileURLToPath(import.meta.url));
const tlsDirectory = resolve(serverRoot, 'data', 'tls');
const publicCaPath = resolve(serverRoot, '..', 'mobile', 'assets', 'lingonest-lan-ca.pem');

function privateLan(ip) {
  if (isIP(ip) !== 4) return false;
  const [first, second] = ip.split('.').map(Number);
  return first === 10 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}

function openssl(args) {
  try {
    execFileSync('openssl', args, {
      cwd: tlsDirectory, stdio: 'pipe', windowsHide: true,
      env: { ...process.env, OPENSSL_CONF: resolve(tlsDirectory, 'openssl.cnf') },
    });
  } catch (error) {
    throw new Error(`OpenSSL failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

const ip = process.argv[2];
if (!privateLan(ip)) throw new Error('Pass the computer private LAN IPv4 address, for example 192.168.1.20');
mkdirSync(tlsDirectory, { recursive: true });
mkdirSync(dirname(publicCaPath), { recursive: true });
writeFileSync(resolve(tlsDirectory, 'openssl.cnf'), '[ req ]\ndistinguished_name=req_distinguished_name\n[ req_distinguished_name ]\n');

const caKey = resolve(tlsDirectory, 'ca.key');
const caCert = resolve(tlsDirectory, 'ca.pem');
const serverKey = resolve(tlsDirectory, 'server.key');
const serverCert = resolve(tlsDirectory, 'server.pem');
if (existsSync(caKey) !== existsSync(caCert)) {
  throw new Error('The local CA is incomplete. Restore both files from a private backup before continuing.');
}
if (!existsSync(caKey)) {
  if (existsSync(publicCaPath)) throw new Error('The app already contains a different CA. Restore its private key or plan an APK trust change.');
  openssl(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '3650',
    '-keyout', caKey, '-out', caCert, '-subj', '/CN=LingoNest Local CA',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}

const validCurrentCert = existsSync(serverKey) && existsSync(serverCert) && (() => {
  try {
    const certificate = new X509Certificate(readFileSync(serverCert));
    return !!certificate.checkIP(ip) && Date.parse(certificate.validTo) > Date.now() + 7 * 86400_000;
  } catch { return false; }
})();

if (!validCurrentCert) {
  const csr = resolve(tlsDirectory, 'server.csr');
  const extensions = resolve(tlsDirectory, 'server.ext');
  writeFileSync(extensions, [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=IP:${ip},IP:127.0.0.1`,
    '',
  ].join('\n'));
  openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-keyout', serverKey,
    '-out', csr, '-subj', `/CN=${ip}`]);
  openssl(['x509', '-req', '-in', csr, '-CA', caCert, '-CAkey', caKey,
    '-CAserial', resolve(tlsDirectory, 'ca.srl'), '-CAcreateserial',
    '-out', serverCert, '-days', '365', '-sha256', '-extfile', extensions]);
}

if (existsSync(publicCaPath) && !readFileSync(publicCaPath).equals(readFileSync(caCert))) {
  throw new Error('The app CA differs from the server CA. Resolve this before replacing the app certificate.');
}
copyFileSync(caCert, publicCaPath);
const fingerprint = new X509Certificate(readFileSync(caCert)).fingerprint256;
console.log(`LAN certificate ready for ${ip}. Public CA SHA-256: ${fingerprint}`);
console.log('Private keys remain under server/data/tls/ (Git ignored).');
