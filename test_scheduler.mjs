// 순수 로직 자체 점검: node test_scheduler.mjs
// DOM 없이 도는 부분만 검사한다 (날짜 키, 공휴일 판정, ICS 이스케이프).
import assert from 'node:assert/strict';
import { Scheduler } from './server/scheduler/core.js';
import './server/scheduler/data.js';

const s = Object.create(Scheduler.prototype);

// --- getDateKey: 로컬 날짜여야 한다 (toISOString()은 KST에서 하루 밀린다) ---
assert.equal(s.getDateKey(new Date(2026, 7, 15)), '2026-08-15', '광복절이 하루 밀림');
assert.equal(s.getDateKey(new Date(2026, 0, 1)), '2026-01-01', '신정이 하루 밀림');
assert.equal(s.getDateKey(new Date(2026, 11, 25)), '2026-12-25', '성탄절이 하루 밀림');

// --- importHolidays가 만드는 키와 isHoliday 조회 키가 맞물려야 한다 ---
s.holidays = new Set(['2026-08-15']); // importHolidays의 `${y}-${m}-${d}` 형식
assert.equal(s.isHoliday(new Date(2026, 7, 15)), true, '가져온 공휴일이 매칭 안 됨');
assert.equal(s.isHoliday(new Date(2026, 7, 14)), false, '엉뚱한 날이 공휴일로 잡힘');

// --- 주말 판정 ---
assert.equal(s.isWeekend(new Date(2026, 7, 15)), true);  // 토
assert.equal(s.isWeekend(new Date(2026, 7, 17)), false); // 월

// --- getWorkingDays: includeWeekends=true면 주말/휴일을 뺀다 ---
s.config = { startDate: new Date(2026, 7, 10) }; // 월요일
assert.equal(s.getWorkingDays(0, 7, true), 5, '주 7일 중 평일은 5일');
assert.equal(s.getWorkingDays(0, 7, false), 7, 'false면 전체 기간 그대로');

// --- ICS 이스케이프 (RFC 5545) ---
const escapeICS = (text) => String(text)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
assert.equal(escapeICS('a,b;c'), 'a\\,b\\;c');
assert.equal(escapeICS('줄1\n줄2'), '줄1\\n줄2', '줄바꿈이 ICS를 깨뜨림');

console.log('통과: 날짜 키 / 공휴일 / 작업일 / ICS 이스케이프');
