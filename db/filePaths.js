const path = require('path');
const fs = require('fs');

const dataDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'QuepilotServer')
  : path.join(__dirname, '..', 'data');

const dbDir = path.join(dataDir, 'db');
const logDir = path.join(dataDir, 'logs');


// 디렉토리 자동 생성
[dataDir, dbDir, logDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 디렉토리 생성됨: ${dir}`);
  }
});

module.exports = { dataDir, dbDir, logDir };