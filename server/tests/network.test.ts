import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { isPrivateLanIpv4 } from '../src/network.js';

test('LAN mode accepts only private IPv4 addresses', () => {
  for (const address of ['10.1.2.3', '172.16.1.2', '172.31.255.1', '192.168.0.8']) {
    assert.equal(isPrivateLanIpv4(address), true);
  }
  for (const address of ['127.0.0.1', '172.32.0.1', '8.8.8.8', '0.0.0.0', 'localhost', '::1']) {
    assert.equal(isPrivateLanIpv4(address), false);
  }
});

test('health-only app never exposes backup routes', async () => {
  const server = createApp(undefined, true).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).mode, 'lan-health-only');
    assert.equal((await fetch(`${base}/backup`)).status, 404);
    assert.equal((await fetch(`${base}/backup`, { method: 'PUT' })).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
