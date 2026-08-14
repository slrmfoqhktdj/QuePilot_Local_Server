const fs = require('fs');
const path = require('path');
const { logDir } = require('../db/filePaths');

// 날짜 문자열 (로컬 기준, 타임스탬프와 동일한 Asia/Seoul 로케일)
function dateStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 현재 날짜의 로그 파일 경로
function getLogFile(d = new Date()) {
  return path.join(logDir, `server-${dateStamp(d)}.log`);
}

let currentDate = dateStamp();
let logFile = getLogFile();
let logStream = fs.createWriteStream(logFile, { flags: 'a' });

// 날짜가 바뀌었으면 새 날짜 파일로 스트림 교체
function ensureTodayStream() {
  const today = dateStamp();
  if (today !== currentDate) {
    logStream.end();
    currentDate = today;
    logFile = getLogFile();
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }
}

// 타임스탬프 생성
function timestamp() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

// 원본 console 백업
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// console.log 덮어쓰기 — 콘솔 + 파일 동시 출력
console.log = function (...args) {
  const msg = `[${timestamp()}] [INFO] ${args.join(' ')}`;
  originalLog.apply(console, args);
  ensureTodayStream();
  logStream.write(msg + '\n');
};

console.error = function (...args) {
  const msg = `[${timestamp()}] [ERROR] ${args.join(' ')}`;
  originalError.apply(console, args);
  ensureTodayStream();
  logStream.write(msg + '\n');
};

console.warn = function (...args) {
  const msg = `[${timestamp()}] [WARN] ${args.join(' ')}`;
  originalWarn.apply(console, args);
  ensureTodayStream();
  logStream.write(msg + '\n');
};

// 60일이 지난 날짜별 로그 파일 삭제 (server-YYYY-MM-DD.log 형식만 대상)
const RETENTION_DAYS = 60;
const LOG_FILE_PATTERN = /^server-\d{4}-\d{2}-\d{2}\.log$/;

function cleanupOldLogs() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(logDir);
    let removed = 0;
    for (const file of files) {
      if (!LOG_FILE_PATTERN.test(file)) continue;
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed++;
      }
    }
    if (removed > 0) {
      originalLog(`[로그 정리] ${removed}개 파일 삭제 (${RETENTION_DAYS}일 경과)`);
    }
  } catch (e) {
    // 무시
  }
}

// 서버 시작 시 + 24시간마다 정리 체크
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

module.exports = { logFile, logDir };
