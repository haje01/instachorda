import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord } from '../extension/lib/chord-parser.js';

test('단순 메이저 코드 파싱', () => {
  assert.deepEqual(parseChord('C'), { root: 'C', quality: 'maj', modifier: '', bass: null });
});

test('마이너 코드 파싱', () => {
  assert.deepEqual(parseChord('Am'), { root: 'A', quality: 'min', modifier: '', bass: null });
});

test('7th 코드 파싱', () => {
  assert.deepEqual(parseChord('G7'), { root: 'G', quality: 'maj', modifier: '7', bass: null });
});

test('마이너 7th 코드 파싱', () => {
  assert.deepEqual(parseChord('Am7'), { root: 'A', quality: 'min', modifier: '7', bass: null });
});

test('maj7 코드 파싱', () => {
  assert.deepEqual(parseChord('Fmaj7'), { root: 'F', quality: 'maj', modifier: 'maj7', bass: null });
});

test('sus4 코드 파싱', () => {
  assert.deepEqual(parseChord('Dsus4'), { root: 'D', quality: 'maj', modifier: 'sus4', bass: null });
});

test('샤프 루트 파싱', () => {
  assert.deepEqual(parseChord('F#m'), { root: 'F#', quality: 'min', modifier: '', bass: null });
});

test('플랫 루트 파싱', () => {
  assert.deepEqual(parseChord('Bb'), { root: 'Bb', quality: 'maj', modifier: '', bass: null });
});

test('디미니시드 파싱', () => {
  assert.deepEqual(parseChord('Bdim'), { root: 'B', quality: 'dim', modifier: '', bass: null });
});

test('슬래시 코드 파싱', () => {
  assert.deepEqual(parseChord('C/G'), { root: 'C', quality: 'maj', modifier: '', bass: 'G' });
});

test('슬래시 + 수식어 파싱', () => {
  assert.deepEqual(parseChord('Am7/G'), { root: 'A', quality: 'min', modifier: '7', bass: 'G' });
});

test('공백 있는 입력 파싱', () => {
  assert.deepEqual(parseChord(' C '), { root: 'C', quality: 'maj', modifier: '', bass: null });
});

test('빈 문자열은 null', () => {
  assert.equal(parseChord(''), null);
});

test('파싱 불가 문자열은 null', () => {
  assert.equal(parseChord('Hello'), null);
});

test('유니코드 플랫/샾 정규화', () => {
  assert.deepEqual(parseChord('B♭'), { root: 'Bb', quality: 'maj', modifier: '', bass: null });
  assert.deepEqual(parseChord('F♯m'), { root: 'F#', quality: 'min', modifier: '', bass: null });
  assert.deepEqual(parseChord('E♭maj7'), { root: 'Eb', quality: 'maj', modifier: 'maj7', bass: null });
});

test('chordscore.com 의 위첨자 b (U+1D47) 정규화', () => {
  assert.deepEqual(parseChord('Bᵇ'), { root: 'Bb', quality: 'maj', modifier: '', bass: null });
  assert.deepEqual(parseChord('BᵇM7'), { root: 'Bb', quality: 'maj', modifier: 'M7', bass: null });
  assert.deepEqual(parseChord('Eᵇm'), { root: 'Eb', quality: 'min', modifier: '', bass: null });
});

test('소문자 루트도 허용 (대문자로 정규화)', () => {
  assert.deepEqual(parseChord('c7'), { root: 'C', quality: 'maj', modifier: '7', bass: null });
  assert.deepEqual(parseChord('a'), { root: 'A', quality: 'maj', modifier: '', bass: null });
  assert.deepEqual(parseChord('f#m'), { root: 'F#', quality: 'min', modifier: '', bass: null });
  // 슬래시 베이스도 소문자 허용
  assert.deepEqual(parseChord('c/g'), { root: 'C', quality: 'maj', modifier: '', bass: 'G' });
});
