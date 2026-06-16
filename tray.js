// 시스템 트레이 아이콘 생성 및 관리
//npm install https://github.com/Edgar-P-yan/node-systray-v2

const { SysTray } = require('node-systray-v2');
const fs = require('fs');
const path = require('path');

function createTray(PORT, onExit) {
  const iconPath = path.join(__dirname, '..', 'icon.ico');
  let iconBase64 = '';
  if (fs.existsSync(iconPath)) {
    iconBase64 = fs.readFileSync(iconPath).toString('base64');
  }

  const systray = new SysTray({
    menu: {
      icon: iconBase64,
      title: '',
      tooltip: 'Quepilot Server',
      items: [
        {
          title: `Quepilot Server (포트: ${PORT})`,
          tooltip: '서버 정보',
          checked: false,
          enabled: false,
        },
        {
          title: '라이센스 페이지 열기',
          tooltip: '브라우저에서 라이센스 페이지를 엽니다',
          checked: false,
          enabled: true,
        },
        {
          title: '서버 종료',
          tooltip: '서버를 종료합니다',
          checked: false,
          enabled: true,
        },
      ],
    },
    debug: false,
    copyDir: true,
  });

  systray.onClick((action) => {
    if (action.seq_id === 1) {
      const { exec } = require('child_process');
      exec(`start http://localhost:${PORT}/license`);
    } else if (action.seq_id === 2) {
      systray.kill(false);
      if (onExit) onExit();
      process.exit(0);
    }
  });

  systray.onReady(() => {
    console.log('🔵 시스템 트레이 아이콘 생성됨');
  });

  systray.onError((err) => {
    console.error('⚠️ 트레이 에러:', err);
  });

  return systray;
}

module.exports = { createTray };
