import assert from 'node:assert/strict';
import test from 'node:test';
import { usernameError, displayNameError, newPasswordError, invitationError, resetTokenError } from '../accountValidation.ts';

test('account form matches server username and nickname limits', () => {
  assert.equal(usernameError(' Alice_1 '), '');
  for (const value of ['1alice', 'ab', 'a'.repeat(25), 'a-b']) assert.notEqual(usernameError(value), '');
  assert.equal(displayNameError(' Alice '), '');
  for (const value of ['   ', 'a'.repeat(41), 'Alice\nBob']) assert.notEqual(displayNameError(value), '');
});

test('new password checks character and UTF-8 byte limits', () => {
  assert.equal(newPasswordError('a'.repeat(10)), '');
  assert.equal(newPasswordError('a'.repeat(128)), '');
  assert.notEqual(newPasswordError('a'.repeat(9)), '');
  assert.notEqual(newPasswordError('a'.repeat(129)), '');
  assert.notEqual(newPasswordError('汉'.repeat(86)), '');
  assert.equal(newPasswordError('汉'.repeat(85)), '');
});

test('invitation and reset credential require complete tokens', () => {
  assert.equal(invitationError(` ${'A'.repeat(43)} `), '');
  assert.notEqual(invitationError('A'.repeat(42)), '');
  assert.notEqual(invitationError('!'.repeat(43)), '');
  assert.equal(resetTokenError('A'.repeat(43)), '');
  assert.notEqual(resetTokenError('A'.repeat(42)), '');
});
