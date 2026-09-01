import test from 'node:test';
import assert from 'node:assert/strict';
import { hostPortConflicts, portKey } from '../../src/shared/composePorts.js';

const svc = (name, ports) => ({ name, ports: ports.map((p) => ({ ...p })) });
const stack = (name, services) => ({ name, services });

test('hostPortConflicts: flags a host port two services publish', () => {
  const c = hostPortConflicts([
    stack('a', [svc('web', [{ host: '8080', container: '80' }])]),
    stack('b', [svc('proxy', [{ host: '8080', container: '8080' }])]),
  ]);
  assert.deepEqual([...c.keys()], ['8080/tcp']);
  assert.deepEqual(
    c.get('8080/tcp').map((o) => `${o.service}@${o.stack}`),
    ['web@a', 'proxy@b']
  );
});

test('hostPortConflicts: tcp and udp on the same number do not clash', () => {
  const c = hostPortConflicts([
    stack('a', [svc('dns', [{ host: '53', container: '53', protocol: 'udp' }])]),
    stack('b', [svc('doh', [{ host: '53', container: '53', protocol: 'tcp' }])]),
  ]);
  assert.equal(c.size, 0);
});

test('hostPortConflicts: a service listing the same mapping twice is not a self-conflict', () => {
  const c = hostPortConflicts([
    stack('a', [svc('web', [{ host: '8080', container: '80' }, { host: '8080', container: '80' }])]),
  ]);
  assert.equal(c.size, 0);
});

test('hostPortConflicts: uses containerName when present; ignores unpublished (expose-only) ports', () => {
  const c = hostPortConflicts([
    stack('a', [{ name: 'x', containerName: 'nginx', ports: [{ host: '443', container: '443' }] }]),
    stack('b', [svc('caddy', [{ host: '443', container: '443' }, { host: null, container: '2019' }])]),
  ]);
  assert.deepEqual(c.get('443/tcp').map((o) => o.service), ['nginx', 'caddy']);
});

test('portKey: defaults missing protocol to tcp', () => {
  assert.equal(portKey('8080', null), '8080/tcp');
  assert.equal(portKey('53', 'udp'), '53/udp');
});
