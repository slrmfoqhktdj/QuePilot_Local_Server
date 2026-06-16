// discovery-server.js
// UDP 디스커버리 서버 구현 - 클라이언트가 네트워크에서 서버를 자동으로 찾을 수 있도록 지원

const dgram = require('dgram');
const os = require('os');

const DISCOVERY_PORT = process.env.DISCOVERY_PORT || 9999;  // 클라이언트가 요청을 보내는 포트
const DISCOVERY_MAGIC = process.env.DISCOVERY_MAGIC || 'QUEPILOT_DISCOVER';  // 클라이언트가 보내는 키워드
const SERVER_HTTP_PORT = process.env.PORT || 8888;

let discoverySocket = null;

function detectLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') ||
            iface.address.startsWith('10.') ||
            iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

function startDiscoveryServer(httpPort) {
  const serverIP = detectLocalIP();
  const port = httpPort || SERVER_HTTP_PORT;

  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  discoverySocket.on('message', (msg, rinfo) => {
    const message = msg.toString().trim();

    // 클라이언트의 디스커버리 요청인지 확인
    if (message === DISCOVERY_MAGIC) {
      console.log(`🔍 디스커버리 요청 수신: ${rinfo.address}:${rinfo.port}`);

      // 서버 정보를 JSON으로 응답
      const response = JSON.stringify({
        magic: 'QUEPILOT_SERVER',
        ip: serverIP,
        port: port,
        url: `http://${serverIP}:${port}`,
        socketPath: '/api',
        name: os.hostname(),
        version: '1.0.0',
      });

      discoverySocket.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error('❌ 디스커버리 응답 실패:', err.message);
        } else {
          console.log(`✅ 디스커버리 응답 전송 → ${rinfo.address}:${rinfo.port}`);
        }
      });
    }
  });

  discoverySocket.on('error', (err) => {
    console.error('❌ 디스커버리 소켓 오류:', err.message);
  });

  discoverySocket.on('listening', () => {
    const addr = discoverySocket.address();
    console.log(`✅ 디스커버리 서버 시작됨 — UDP ${addr.address}:${addr.port}`);
    console.log(`   서버 IP: ${serverIP}, HTTP 포트: ${port}`);
  });

  discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0');

  return discoverySocket;
}

function stopDiscoveryServer() {
  if (discoverySocket) {
    discoverySocket.close();
    discoverySocket = null;
    console.log('🛑 디스커버리 서버 종료됨');
  }
}

module.exports = {
  startDiscoveryServer,
  stopDiscoveryServer,
  detectLocalIP,
  DISCOVERY_PORT,
  DISCOVERY_MAGIC,
};
