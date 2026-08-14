const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir } = require('../db/filePaths');

// Admin 로컬 정체성(고유 ID) 관리
// 1순위: .env의 ADMIN_ID (운영자가 명시 지정)
// 2순위: %APPDATA%\QuepilotServer\adminId 파일 (설치본마다 1회 생성 후 영구 고정)
function getAdminId() {
  if (process.env.ADMIN_ID) return process.env.ADMIN_ID;

  const file = path.join(dataDir, 'adminId');
  try {
    if (fs.existsSync(file)) {
      const stored = fs.readFileSync(file, 'utf8').trim();
      if (stored) return stored;
    }
  } catch (e) {
    console.error('adminId 파일 읽기 실패:', e);
  }

  const newId = crypto.randomUUID();
  try {
    fs.writeFileSync(file, newId, 'utf8');
    console.log(`🔑 Admin ID 생성됨: ${newId}`);
  } catch (e) {
    console.error('adminId 파일 저장 실패:', e);
  }
  return newId;
}

module.exports = { getAdminId };
