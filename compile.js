// compile.js
// CuePilot 프로젝트의 주요 .js 파일들을 bytenode로 컴파일하여 보안을 강화하는 스크립트

const bytenode = require('./app/node_modules/bytenode');
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, 'app');

// ★ 직접 작성한 파일만 나열 (npm 패키지는 건드리지 않음)
const TARGET_FILES = [
  'main-server.js',
  'discovery-server.js',
  'tray.js',
  'db/sqliteDatabase.js',
  'db/controls/usercontrols.js',
  'db/controls/projectscontrols.js',
  'db/controls/roomscontrols.js',
  'db/controls/timelinecontrols.js',
  'db/controls/messagescontrols.js',
  'handlers/callHandler.js',
  'handlers/directCallHandler.js',
  'handlers/messageCleanupHandler.js',
  'handlers/projectHandler.js',
  'handlers/roomHandler.js',
  'handlers/timelineHandler.js',
  'handlers/userHandler.js',
  'license/licenseManager.js',
  'models/commonSchemas.js',
  'timer/timelinetimer.js',
  'utils/jsonBuilder.js',
  'utils/socketHelpers.js',
  'utils/logger.js',
  
  // 프로젝트에 있는 직접 작성한 .js 파일 모두 추가
];

async function compile() {
  console.log('========================================');
  console.log(' CuePilot 바이트코드 컴파일');
  console.log('========================================\n');

  let success = 0;
  let skip = 0;
  let fail = 0;

  for (const file of TARGET_FILES) {
    const filePath = path.join(APP_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  건너뜀 (파일 없음): ${file}`);
      skip++;
      continue;
    }

    try {
      // 1) .js → .jsc 컴파일
      await bytenode.compileFile({
        filename: filePath,
        compileAsModule: true,
      });

      // 2) 원본 .js를 2줄짜리 로더로 교체
      const jscName = path.basename(file, '.js') + '.jsc';
      const loaderContent =
        `require('bytenode');\n` +
        `module.exports = require('./${jscName}');\n`;

      fs.writeFileSync(filePath, loaderContent, 'utf-8');

      console.log(`  ✅ ${file} → ${file.replace('.js', '.jsc')}`);
      success++;
    } catch (err) {
      console.error(`  ❌ ${file}: ${err.message}`);
      fail++;
    }
  }

  console.log('\n========================================');
  console.log(` 결과: ✅ ${success}  ⚠️ ${skip}  ❌ ${fail}`);
  console.log('========================================');
}

compile();
