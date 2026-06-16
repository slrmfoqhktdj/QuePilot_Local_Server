const fs = require('fs');
const path = require('path');
const { logDir } = require('../db/filePaths');

const logFile = path.join(logDir, 'server.log');

// 로그 파일 스트림 (append 모드)
let logStream = fs.createWriteStream(logFile, { flags: 'a' });

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
  logStream.write(msg + '\n');
};

console.error = function (...args) {
  const msg = `[${timestamp()}] [ERROR] ${args.join(' ')}`;
  originalError.apply(console, args);
  logStream.write(msg + '\n');
};

console.warn = function (...args) {
  const msg = `[${timestamp()}] [WARN] ${args.join(' ')}`;
  originalWarn.apply(console, args);
  logStream.write(msg + '\n');
};

// 로그 파일 크기 관리 (10MB 초과 시 로테이션)
function rotateLog() {
  try {
    const stats = fs.statSync(logFile);
    if (stats.size > 10 * 1024 * 1024) {
      const backupFile = path.join(logDir, 'server.old.log');
      if (fs.existsSync(backupFile)) {
        fs.unlinkSync(backupFile);
      }
      // 현재 스트림 닫기
      logStream.end();
      // 현재 로그를 백업으로 이동
      fs.renameSync(logFile, backupFile);
      // 새 스트림으로 교체
      logStream = fs.createWriteStream(logFile, { flags: 'a' });
      originalLog('[로그 로테이션 완료]');
    }
  } catch (e) {
    // 무시
  }
}

// 1시간마다 로테이션 체크
setInterval(rotateLog, 60 * 60 * 1000);

module.exports = { logFile, logDir };
