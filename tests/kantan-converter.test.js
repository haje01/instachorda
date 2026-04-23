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

test('테이블에 없는 마이너는 ~ 스왑 (대괄호 밖)', () => {
  assert.equal(toKantan('Cm', 'C'), '1~');
  assert.equal(toKantan('Fm', 'C'), '4~');
});

test('마이너 + 수식어는 "숫자~[수식어]" 형태', () => {
  // G키 슬롯 5 는 D(major). Dm7 은 5~[7]
  assert.equal(toKantan('Dm7', 'G'), '5~[7]');
  // C키 슬롯 1 은 C(major). Cm7 은 1~[7]
  assert.equal(toKantan('Cm7', 'C'), '1~[7]');
});

test('근음이 테이블에 없으면 가까운 슬롯 + [b] 또는 [#]', () => {
  // G키는 슬롯 1~7 (G, Am, Bm, C, D, Em, F#m). Bb 는 B(슬롯3) 의 반음 아래.
  assert.equal(toKantan('Bb', 'G'), '3[b]');
});

test('크로매틱 + 수식어는 같은 대괄호 안에 결합', () => {
  // G키에서 Bb7 은 3[b7]
  assert.equal(toKantan('Bb7', 'G'), '3[b7]');
});

test('근음도 슬롯도 없고 반음 주변도 없으면 null', () => {
  // 모든 슬롯이 F# 를 포함하지 않는 가상 상황은 현 테이블에선 드묾.
  // 대신 완전히 형식이 안 맞는 것으로 검증.
  assert.equal(toKantan('Zxy', 'C'), null);
});

test('파싱 실패는 null', () => {
  assert.equal(toKantan('Hello', 'C'), null);
  assert.equal(toKantan('', 'C'), null);
});

test('공백으로 두 코드가 붙은 입력은 거부 (어댑터가 분리해야 함)', () => {
  // 파서가 관대하게 받으면 "5[7 C]" 같은 잘못된 결과가 나옴. 거부해야 함.
  assert.equal(toKantan('Dm7 C', 'G'), null);
});

test('알 수 없는 키는 null', () => {
  assert.equal(toKantan('C', 'Z'), null);
});
