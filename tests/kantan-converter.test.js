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

test('메이저 코드가 마이너 슬롯에 매칭될 때도 ~ 스왑', () => {
  // B키 슬롯 6 은 G#m. 입력이 G#(major) 이면 6~
  assert.equal(toKantan('G#', 'B'), '6~');
  // 수식어가 붙어도 동일
  assert.equal(toKantan('G#7', 'B'), '6~[7]');
});

test('sus 수식어는 3도를 제거하므로 ~ 스왑 불필요', () => {
  // C키 슬롯 2 는 Dm. Dsus4 는 2[sus4] (swap 없음)
  assert.equal(toKantan('Dsus4', 'C'), '2[sus4]');
  assert.equal(toKantan('Dsus2', 'C'), '2[sus2]');
});

test('dim / aug 는 수식어로 흡수', () => {
  // C키 슬롯 7 은 Bm. Bdim 은 7[dim]
  assert.equal(toKantan('Bdim', 'C'), '7[dim]');
});

test('근음이 테이블에 없으면 가까운 슬롯 + [b] 또는 [#]', () => {
  // G 키에 Db 는 없음. D(슬롯 5) 의 반음 아래 -> 5[b]
  assert.equal(toKantan('Db', 'G'), '5[b]');
});

test('크로매틱 + 수식어는 같은 대괄호 안에 결합', () => {
  assert.equal(toKantan('Db7', 'G'), '5[b7]');
});

test('이명동음은 슬롯 매칭 (G 키 슬롯 8 은 A#, Bb 도 동일 음)', () => {
  assert.equal(toKantan('Bb', 'G'), '8');
  assert.equal(toKantan('A#', 'G'), '8');
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

test('ultimate-guitar 실측 코드명 변환 (C키, "A Whiter Shade of Pale")', () => {
  // UG 는 슬래시 베이스를 한 토큰(예: "Am/G")으로 제공. 결합 로직 없이 그대로 변환되어야 함.
  assert.equal(toKantan('C/B', 'C'), '1/7');
  assert.equal(toKantan('Am/G', 'C'), '6/5');
  assert.equal(toKantan('F/E', 'C'), '4/3');
  assert.equal(toKantan('Dm/C', 'C'), '2/1');
  assert.equal(toKantan('G/F', 'C'), '5/4');
  assert.equal(toKantan('Em/D', 'C'), '3/2');
  // 텐션/수식어가 붙은 UG 코드명
  assert.equal(toKantan('G6', 'C'), '5[6]');
  assert.equal(toKantan('G7', 'C'), '5[7]');
  assert.equal(toKantan('G6add11', 'C'), '5[6add11]');
});
