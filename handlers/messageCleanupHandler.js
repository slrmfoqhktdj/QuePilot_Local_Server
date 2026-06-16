const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const {dataDir} = require('../db/filePaths');
const {
    deleteScheduleRoomMessages,
    deleteSchedulePersonalMessages
} = require('../db/controls/messagescontrols');

const CLEANUP_RECORD = path.join(dataDir, '.last_cleanup');
const CLEANUP_INTERVAL_HOURS = 24;

// ✅ 참조 저장용 변수
let cronTask = null;
let backupInterval = null;

function getLastCleanupTime() {
    try {
        if (fs.existsSync(CLEANUP_RECORD)) {
            const data = fs.readFileSync(CLEANUP_RECORD, 'utf-8');
            return new Date(data.trim());
        }
    } catch (e) {}
    return null;
}

function saveLastCleanupTime() {
    try {
        const dir = path.dirname(CLEANUP_RECORD);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CLEANUP_RECORD, new Date().toISOString());
    } catch (e) {
        console.error('[Cleanup] 기록 저장 실패:', e.message);
    }
}

function isCleanupNeeded() {
    const lastCleanup = getLastCleanupTime();
    if (!lastCleanup) return true;
    const hoursSinceLastCleanup = (Date.now() - lastCleanup.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastCleanup >= CLEANUP_INTERVAL_HOURS;
}

async function runCleanup() {
    console.log('[Cleanup] 메시지 정리 시작...');
    const start = Date.now();
    try {
        await deleteScheduleRoomMessages();
        await deleteSchedulePersonalMessages();
        saveLastCleanupTime();
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[Cleanup] 메시지 정리 완료 (${elapsed}초)`);
    } catch (err) {
        console.error('[Cleanup] 메시지 정리 오류:', err);
    }
}

function initCleanupScheduler() {
    // 기존 스케줄러가 있으면 먼저 정리
    stopCleanupScheduler();

    // 1. 서버 시작 시 체크
    if (isCleanupNeeded()) {
        console.log('[Cleanup] 마지막 정리 후 24시간 경과 — 즉시 실행');
        setTimeout(() => { runCleanup(); }, 10 * 1000);
    } else {
        const lastCleanup = getLastCleanupTime();
        const hoursAgo = ((Date.now() - lastCleanup.getTime()) / (1000 * 60 * 60)).toFixed(1);
        console.log(`[Cleanup] 마지막 정리: ${hoursAgo}시간 전 — 스킵`);
    }

    // 2. 매일 새벽 3시
    cronTask = cron.schedule('0 3 * * *', () => {
        runCleanup();
    });

    // 3. 6시간마다 백업 체크
    backupInterval = setInterval(() => {
        if (isCleanupNeeded()) {
            console.log('[Cleanup] 정기 체크 — 정리 필요, 실행');
            runCleanup();
        }
    }, 6 * 60 * 60 * 1000);

    console.log('[Cleanup] 스케줄러 초기화 완료');
}

// ✅ 정리 함수
function stopCleanupScheduler() {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
    }
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
    }
    console.log('[Cleanup] 스케줄러 정리 완료');
}

module.exports = { initCleanupScheduler, stopCleanupScheduler };
