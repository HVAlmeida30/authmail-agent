import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOtp, textFromEmail } from '../lib/otp.ts';
import { parseAliasRequest, isAliasOpen, canonicalDomain } from '../lib/alias.ts';

test('extrai código de verificação em português', () => {
  assert.equal(extractOtp('Seu código de verificação: 482 916'), '482916');
});
test('extrai OTP inglês', () => {
  assert.equal(extractOtp('Your verification code is 123456'), '123456');
});
test('não confunde número arbitrário com autenticação', () => {
  assert.equal(extractOtp('Pedido 123456, total 100 reais'), null);
});
test('nunca executa HTML de mensagens', () => {
  assert.equal(textFromEmail(null, '<p>Código 1234</p><script>alert(1)</script>'), 'Código 1234');
});
test('impede validade desconhecida', () => {
  assert.equal(parseAliasRequest({kind:'temporary',ttlMinutes:999}), null);
  assert.equal(parseAliasRequest({kind:'temporary',ttlMinutes:15})?.kind, 'temporary');
  assert.equal(parseAliasRequest({kind:'permanent'})?.ttlMinutes, null);
});
test('reconhece alias expirado e desativado', () => {
  assert.equal(isAliasOpen({is_active:true,expires_at:'2020-01-01T00:00:00Z'}),false);
  assert.equal(isAliasOpen({is_active:false,expires_at:null}),false);
  assert.equal(isAliasOpen({is_active:true,expires_at:null}),true);
});
test('domínio restrito e normalizado', () => {
  assert.equal(canonicalDomain('CAIXA.Example.COM'), 'caixa.example.com');
  assert.equal(canonicalDomain('SUBSTITUA.resend.app'), null);
});
