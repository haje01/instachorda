#!/usr/bin/env node
// instachorda CLI — KANTAN 변환 로직을 터미널에서 테스트
//
// 사용법:
//   instachorda convert --key C "C G Am F"
//   instachorda detect-key "C G Am F"
//   instachorda table --key C

import { toKantan } from '../extension/lib/kantan-converter.js';
import { detectKey } from '../extension/lib/key-detector.js';
import { getTable, SUPPORTED_KEYS } from '../extension/lib/kantan-tables.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function splitChords(s) {
  return s.split(/[\s|]+/).map(x => x.trim()).filter(Boolean);
}

function cmdConvert(args) {
  const chords = splitChords(args._.join(' '));
  if (chords.length === 0) {
    console.error('에러: 변환할 코드를 인자로 전달해 주세요. 예: instachorda convert --key C "C G Am F"');
    process.exit(1);
  }
  const key = args.key || detectKey(chords) || 'C';
  console.log(`[키: ${key}]`);
  for (const c of chords) {
    const k = toKantan(c, key);
    console.log(`  ${c.padEnd(8)} -> ${k ?? '(변환불가)'}`);
  }
}

function cmdDetectKey(args) {
  const chords = splitChords(args._.join(' '));
  if (chords.length === 0) {
    console.error('에러: 코드를 전달해 주세요.');
    process.exit(1);
  }
  const key = detectKey(chords);
  console.log(key ?? '(감지실패)');
}

function cmdTable(args) {
  const key = args.key;
  if (!key) {
    console.log('지원 키:', SUPPORTED_KEYS.join(', '));
    return;
  }
  const table = getTable(key);
  if (!table) {
    console.error(`에러: 키 '${key}' 는 아직 지원되지 않습니다.`);
    process.exit(1);
  }
  console.log(`[${key} 키 테이블]`);
  for (const [n, slot] of Object.entries(table)) {
    const q = slot.quality === 'min' ? 'm' : (slot.quality === 'dim' ? 'dim' : '');
    console.log(`  ${n}: ${slot.root}${q}`);
  }
}

function usage() {
  console.log(`instachorda - KANTAN 코드 변환 도구

사용법:
  instachorda convert --key <KEY> "<CHORDS>"   표준 코드를 KANTAN 숫자로 변환
  instachorda detect-key "<CHORDS>"            코드 목록에서 기본 키 추론
  instachorda table [--key <KEY>]              KANTAN 테이블 출력

예시:
  instachorda convert --key C "C G Am F"
  instachorda detect-key "C G Am F G7 C"
  instachorda table --key C
`);
}

const [, , sub, ...rest] = process.argv;
const args = parseArgs(rest);

switch (sub) {
  case 'convert': cmdConvert(args); break;
  case 'detect-key': cmdDetectKey(args); break;
  case 'table': cmdTable(args); break;
  case '-h': case '--help': case undefined: usage(); break;
  default:
    console.error(`알 수 없는 커맨드: ${sub}`);
    usage();
    process.exit(1);
}
