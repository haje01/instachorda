import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKey } from '../extension/lib/key-detector.js';

test('전형적인 C키 진행', () => {
  // Let It Be 스타일: C G Am F
  assert.equal(detectKey(['C', 'G', 'Am', 'F']), 'C');
});

test('C키 확장 진행', () => {
  assert.equal(detectKey(['C', 'Am', 'F', 'G', 'C', 'Em', 'Dm', 'G7']), 'C');
});

test('G키 진행', () => {
  assert.equal(detectKey(['G', 'D', 'Em', 'C']), 'G');
});

test('빈 입력은 null', () => {
  assert.equal(detectKey([]), null);
});

test('파싱 불가만 있으면 null', () => {
  assert.equal(detectKey(['Hello', 'World']), null);
});

test('수식어 있는 코드도 카운트', () => {
  assert.equal(detectKey(['C', 'G7', 'Am7', 'Fmaj7']), 'C');
});

test('샤프 키 감지 (F#)', () => {
  assert.equal(detectKey(['F#', 'C#', 'D#m', 'B']), 'F#');
});

test('A 키 감지', () => {
  assert.equal(detectKey(['A', 'E', 'F#m', 'D']), 'A');
});

test('~ 스왑을 최소화하는 키 선호', () => {
  // Dm 이 슬롯에 그대로 있는 키(C/F/Bb 중 하나)가 선호되어야 하고,
  // D(major) 로만 쓰는 키(D/G)는 Dm 에서 ~ 가 필요해 불이익
  const k = detectKey(['Dm', 'Am', 'Gm']);
  // Dm, Am, Gm 모두 슬롯 그대로인 키는 F (1=F, 2=Gm, 3=Am, 4=Bb, 5=C, 6=Dm, 7=Em)
  assert.equal(k, 'F');
});

test('크로매틱이 적은 키 선호', () => {
  // 주로 G키 음들 + 보조 F -> G키면 전부 슬롯 안, C키면 F는 4 지만 D 가 곤란
  assert.equal(detectKey(['G', 'D', 'Em', 'C', 'F']), 'G');
});
