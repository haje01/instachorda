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

test('세컨더리 도미넌트가 많아도 토닉 중심 키 선호', () => {
  // A 장조 곡 (涙はどこへいったの 스타일): 세컨더리 도미넌트 F#, B, C#7 다수.
  // 마커 수만 보면 B 키가 유리하지만 (F#→5, B→1, A→9 보너스 슬롯),
  // 토닉 A 를 보너스 슬롯 9 에 두는 것은 부자연스러움.
  // 보너스 슬롯(8/9) 사용 패널티로 A 키가 선택되어야 함.
  const chords = [
    'A', 'Asus4', 'A', 'Asus4', 'F#', 'B', 'F#', 'B', 'D', 'E',
    'A', 'AM7', 'A6', 'F#7sus4', 'F#7', 'Bm', 'BmM7', 'Bm7', 'E7',
    'A', 'C#aug7', 'C#7', 'F#m7', 'F#7sus4', 'F#7',
    'Bm7', 'C#m7', 'D', 'E', 'A', 'Asus4', 'Asus4', 'A',
  ];
  assert.equal(detectKey(chords), 'A');
});

test('ultimate-guitar 슬래시-베이스 곡 자동 키 추론 (C)', () => {
  // "A Whiter Shade of Pale" 도입부. UG 는 슬래시 베이스를 한 토큰으로 제공.
  const chords = ['C', 'C/B', 'Am', 'Am/G', 'F', 'F/E', 'Dm', 'Dm/C', 'G', 'G/F', 'Em', 'Em/D'];
  assert.equal(detectKey(chords), 'C');
});
