import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toKantan } from '../extension/lib/kantan-converter.js';

test('C키 기본 다이어토닉 변환', () => {
  assert.equal(toKantan('C', 'C'), '1');
  assert.equal(toKantan('Dm', 'C'), '2');
  assert.equal(toKantan('Em', 'C'), '3');
  assert.equal(toKantan('F', 'C'), '4');
  assert.equal(toKantan('G', 'C'), '5');
  assert.equal(toKantan('Am', 'C'), '6');
  assert.equal(toKantan('Bm', 'C'), '7');
});

test('C키 보너스 슬롯 8, 9', () => {
  assert.equal(toKantan('Eb', 'C'), '8');
  assert.equal(toKantan('Bb', 'C'), '9');
});

test('수식어는 대괄호 안에', () => {
  assert.equal(toKantan('G7', 'C'), '5[7]');
  assert.equal(toKantan('Am7', 'C'), '6[7]');
  assert.equal(toKantan('Fmaj7', 'C'), '4[maj7]');
  assert.equal(toKantan('Dsus4', 'C'), '2[sus4]');
});

test('슬래시 코드', () => {
  assert.equal(toKantan('C/G', 'C'), '1/5');
  assert.equal(toKantan('F/A', 'C'), '4/6');
});

test('테이블에 없는 마이너는 m 대신 ~ 스왑', () => {
  // C키 테이블에서 1번 슬롯은 C(major). Cm 을 만나면 1~
  assert.equal(toKantan('Cm', 'C'), '1~');
  // 4번 슬롯은 F(major). Fm 을 만나면 4~
  assert.equal(toKantan('Fm', 'C'), '4~');
});

test('테이블에 없는 코드는 null', () => {
  // C키에 없는 코드 (예: Ab major)
  assert.equal(toKantan('Ab', 'C'), null);
});

test('파싱 실패는 null', () => {
  assert.equal(toKantan('Hello', 'C'), null);
  assert.equal(toKantan('', 'C'), null);
});

test('알 수 없는 키는 null', () => {
  assert.equal(toKantan('C', 'Z'), null);
});
