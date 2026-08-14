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
  const port = httpPort || SERVER_HTTP_PORT;

  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  discoverySocket.on('message', (msg, rinfo) => {
    const message = msg.toString().trim();

    if (message === DISCOVERY_MAGIC) {
      console.log(`🔍 디스커버리 요청 수신: ${rinfo.address}:${rinfo.port}`);

      // ★ 클라이언트와 같은 네트워크의 IP를 찾아서 응답
      const serverIP = findMatchingIP(rinfo.address);

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
          console.log(`✅ 디스커버리 응답 전송 → ${rinfo.address}:${rinfo.port} (서버IP: ${serverIP})`);
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
    console.log(`   감지된 IP 목록:`, getAllLocalIPs());
  });

  discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0');

  return discoverySocket;
}

// ★ 클라이언트 IP와 같은 서브넷의 서버 IP를 찾기
function findMatchingIP(clientIP) {
  const clientParts = clientIP.split('.');
  const clientSubnet = clientParts.slice(0, 3).join('.'); // 예: 192.168.50

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ifaceSubnet = iface.address.split('.').slice(0, 3).join('.');
        if (ifaceSubnet === clientSubnet) {
          return iface.address;
        }
      }
    }
  }

  // 같은 서브넷을 못 찾으면 기존 방식으로 폴백
  return detectLocalIP();
}

// ★ 디버그용: 모든 로컬 IP 반환
function getAllLocalIPs() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(`${name}: ${iface.address}`);
      }
    }
  }
  return ips;
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
