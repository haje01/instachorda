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
