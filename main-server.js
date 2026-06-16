require('./utils/logger');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
const cookieSignature = require('cookie-signature');
// const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');    // 알림창 띄우기용
const { dbDir } = require('./db/filePaths');
const { createTray } = require('./tray');
// const { v4: uuidv4 } = require('uuid');

const { startDiscoveryServer, stopDiscoveryServer } = require('./discovery-server');

const licenseManager = require('./license/licenseManager');// 라이선스 관리 모듈

const projectHandler = require('./handlers/projectHandler');
const userHandler = require('./handlers/userHandler');
const timelineHandler = require('./handlers/timelineHandler');
const messageCleanupHandler = require('./handlers/messageCleanupHandler');
const directCallHandler = require('./handlers/directCallHandler');

const usercontrols = require('./db/controls/usercontrols');
const JsonBuilder = require('./utils/jsonBuilder');


const adminType = process.env.ADMIN_TYPE || 'admin';
const clientType = process.env.CLIENT_TYPE || 'client';

const PORT = process.env.PORT || 8888;
const HOST = process.env.HOST || '0.0.0.0';

const MyadminId = '075ea07b-fda8-11f0-99ce-121212121212'; // Admin 고유 ID 예시



const app = express();
const server = http.createServer(app);

// ========== 기본 미들웨어 ==========
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 내부망 전용 CORS 설정 (모든 로컬 IP 허용) ==========
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ========== 라이선스 라우트 (항상 동작) ==========

// 인증 페이지
app.get('/license', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'license.html'));
});

// 구독 계정 로그인 → 중앙 서버에 인증 → 토큰 발급
app.post('/license/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: '이메일과 비밀번호를 입력하세요',
    });
  }

  const result = await licenseManager.login(email, password);

  if (result.success) {

    // 인증 성공 → 메인 서버 활성화
    activateMainServer();

    res.json({
      success: true,
      account: email,
      plan: licenseManager.plan,
      companyName: licenseManager.companyName,
      maxUsers: licenseManager.maxUsers,
      expiresAt: licenseManager.expiresAt,
    });
  } else {
    res.status(401).json({
      success: false,
      message: result.message,
    });
  }
});

// 라이선스 상태 확인
app.get('/license/status', (req, res) => {
  res.json({
    isValid: licenseManager.isValid,
    account: licenseManager.account,
    plan: licenseManager.plan,
    companyName: licenseManager.companyName,
    maxUsers: licenseManager.maxUsers,
    expiresAt: licenseManager.expiresAt,
  });
});

// 로그아웃
app.post('/license/logout', async (req, res) => {
  deactivateMainServer();
  await licenseManager.logout();
  res.json({ success: true });
});

// ========== 라이선스 검증 미들웨어 ==========

function requireLicense(req, res, next) {
  if (!licenseManager.isValid || !isServerActivated) {
    return res.status(403).json({
      success: false,
      message: '라이선스 인증이 필요합니다',
    });
  }
  next();
}

// ========== SQLite 세션 스토어 설정 ==========

// db 폴더가 없으면 자동 생성
// const dbDir = path.join(__dirname, 'db');
// if (!fs.existsSync(dbDir)) {
//   fs.mkdirSync(dbDir, { recursive: true });
//   console.log('📁 db 디렉토리 생성됨');
// }


const sessionDb = new Database(path.join(dbDir, 'sessions.db'), {
  verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// 내부망 전용 세션 설정
const sessionMiddleware = session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 3600000 // 1시간마다 만료 세션 정리 (내부망이므로 덜 빈번하게)
    }
  }),
  secret: process.env.SESSION_SECRET || 'local-network-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일 (내부망이므로 길게 설정)
    secure: false, // HTTP 허용 (내부망)
    httpOnly: true,
    sameSite: 'lax'
  },
  name: process.env.SESSION_NAME || 'localSessionId',
  // 내부망 프록시 설정 (필요시)
  proxy: false
});


app.use(sessionMiddleware);

const socketSessionMiddleware = (socket, next) => {
  const req = socket.request;
  // const res = { getHeader: () => {}, setHeader: () => {}, end: () => {} };

  // ✅ 핵심: express-session이 요구하는 res 메서드를 모두 구현
  const res = req.res || {};

  // 헤더 저장소
  const headers = {};

   // ★ 디버깅: 쿠키가 실제로 도착하는지 확인
  console.log('🔍 [세션] req.headers.cookie:', req.headers.cookie);
  console.log('🔍 [세션] handshake.headers.cookie:', socket.handshake.headers?.cookie);
  console.log('🔍 [세션] extraHeaders cookie:', socket.handshake.auth);

  res.getHeader = function (name) {
    return headers[name.toLowerCase()];
  };

  res.setHeader = function (name, value) {
    console.log('🔍 [3] setHeader:', name);
    headers[name.toLowerCase()] = value;
  };

  // express-session이 writeHead를 오버라이드하므로 필요
  res.writeHead = function () {
    console.log('🔍 [3] writeHead 호출됨');
  };

  // end가 함수여야 함
  res.end = function () { };

  // ✅ req.res가 없으면 할당
  if (!req.res) {
    req.res = res;
  }

  sessionMiddleware(req, res, err => {
    if (err) {
      console.error('❌ 세션 미들웨어 오류:', err);
      return next(err);
    }

    if (!req.session) {
      return next(new Error('Session creation failed'));
    }

    socket.handshake.session = req.session;
    console.log('✅ 세션 연동 완료:', req.session.id);
    next();
  });
};

// ========================================
// Socket.IO 서버 설정
// ========================================

const io = socketIO(server, {
  pingTimeout: 60000, // 60초로 설정;
  pingInterval: 25000, // 25초마다 ping 전송
  upgradeTimeout: 45000, // 업그레이드 타임아웃 45초
  transports: ['websocket', 'polling'], // WebSocket 및 Polling 지원
  allowUpgrades: true, // Websocket 우선사용
  allowEIO3: true, // 구형 클라이언트 지원
  path: '/api', // Socket.IO 경로
  cors: {
    origin: true, // 모든 출처 허용 (내부망이므로)
    methods: ["GET", "POST"],
    credentials: true,
  }
});

// ========== 수동 세션 연동 (socket.io-session 대체) ==========
io.use(socketSessionMiddleware);

// 소켓 연결 시 라이선스 검증
io.use((socket, next) => {

  if (!licenseManager.isValid || !isServerActivated) {
    console.error('[7] 라이센스 검증 실패 1');
    return next(new Error('라이선스 인증이 필요합니다'));
  }

  if (usersInfo.size >= licenseManager.maxUsers) {
    console.error('[7] 라이센스 검증 실패 2');
    return next(new Error(`최대 접속자 수(${licenseManager.maxUsers}명)를 초과했습니다`));
  }

  next();
});

// ========== 전역 사용자 정보 맵 ==========

// 사용자 정보 저장
const usersInfo = new Map();

// ========== 서비스 API 라우트 (라이선스 필요) ==========

// 로그인 (간소화된 내부망 버전)
app.post('/login', requireLicense, async (req, res) => {
  try {
    const { login_id, password } = req.body;

    if (!login_id || !password) {
      return res.status(400).json({
        success: false,
        message: 'Login ID and password required'
      });
    }

    const result = await usercontrols.loginUser(login_id, password);

    if (result == null) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ★ 같은 userId로 된 기존 세션 모두 삭제 (현재 세션 제외)
    try {
      const existingSessions = sessionDb.prepare('SELECT sid, sess FROM sessions').all();
      let deletedCount = 0;

      for (const row of existingSessions) {
        try {
          const sessData = JSON.parse(row.sess);
          if (sessData.userId === result.id && row.sid !== req.session.id) {
            sessionDb.prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
            deletedCount++;
          }
        } catch (e) {
          // 파싱 실패한 세션도 삭제
          sessionDb.prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🗑️ 기존 세션 ${deletedCount}개 삭제 (사용자: ${result.login_id})`);
      }
    } catch (e) {
      console.error('기존 세션 정리 실패:', e);
    }

    // 세션에 사용자 정보 저장
    req.session.userId = result.id;
    req.session.userLoginId = result.login_id;
    req.session.userName = result.name;
    req.session.userType = clientType;
    req.session.loginIP = req.ip; // 접속 IP 기록
    req.session.loginTime = new Date().toISOString();

    // 세션 저장 후 응답
    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({
          success: false,
          message: 'Session save failed'
        });
      }

      console.log(`✅ User logged in: ${result.login_id} (ID: ${result.id}) from ${req.ip}`);

      res.json({
        success: true,
        user: {
          id: result.id,
          login_id: result.login_id,
          name: result.name
        },
        sessionId: req.session.id,
        // signedCookie: `${process.env.SESSION_NAME || 'localSessionId'}=${encodeURIComponent(
        //     's:' + cookieSignature.sign(
        //       req.session.id, 
        //       process.env.SESSION_SECRET || 'local-network-secret-key'
        //     )
        // )}`,
      });
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// 로그아웃
app.post('/logout', requireLicense, (req, res) => {
  const userId = req.session.userId;
  const userName = req.session.userName;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Not logged in'
    });
  }

  // usersInfo에서 제거 및 소켓 강제 종료
  if (usersInfo.has(userId)) {
    const userInfo = usersInfo.get(userId);

    // 메인 소켓 종료
    if (userInfo.mainSocketId) {
      const mainSocket = io.sockets.sockets.get(userInfo.mainSocketId);
      if (mainSocket) {
        mainSocket.disconnect(true);
      }
    }

    // 프로젝트 소켓 종료
    if (userInfo.projectSocketId && userInfo.projectId) {
      const projectNamespace = io.of(`/${userInfo.projectId}`);
      const projectSocket = projectNamespace.sockets.get(userInfo.projectSocketId);
      if (projectSocket) {
        projectSocket.disconnect(true);
      }
    }

    usersInfo.delete(userId);
  }

  // 세션 파괴
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }

    console.log(`👋 User logged out: ${userName} (ID: ${userId})`);
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// 세션 확인 (내부망 디버깅용 정보 추가 / 오토 로그인 구현 시 활용)
app.get('/session', requireLicense, (req, res) => {
  console.log(`세션 정보 요청: ${req.ip}`);
  if (req.session.userId) {
    console.log(`✅ Authenticated session for user ${req.session.userName} (ID: ${req.session.userId}) from ${req.ip}`);
    res.json({
      success: true,
      user: {
        id: req.session.userId,
        login_id: req.session.userLoginId,
        name: req.session.userName
      },
      sessionId: req.session.id,
      loginIP: req.session.loginIP,
      loginTime: req.session.loginTime,
      currentIP: req.ip
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// 프로젝트 목록 조회
app.get('/projects', requireLicense, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  try {
    // const result = await projectcontrols.getProjectsByUserId(req.session.userId);
    const projects = await projectHandler.selectProjectsNamespace();
    res.json({ success: true, projects: projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// 활성 사용자 목록 (내부망 관리용)
app.get('/active-users', requireLicense, (req, res) => {
  // Admin 전용 또는 개발 모드에서만
  if (req.session.userType !== 'admin' && process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const users = Array.from(usersInfo.values()).map(user => ({
    userId: user.userId,
    userName: user.userName,
    type: user.type,
    projectId: user.projectId,
    roomId: user.roomId,
    status: user.status,
    hasMainSocket: !!user.mainSocketId,
    hasProjectSocket: !!user.projectSocketId,
    connectedAt: user.connectedAt

  }));

  res.json({
    success: true,
    count: users.length,
    users
  });
});




// ========== Socket.IO 메인 서버 연결 ==========


io.on('connection', async (socket) => {
  console.log(`[메인서버] 클라이언트 연결: ${socket.id}`);
  const session = socket.handshake.session;
  const clientIP = socket.handshake.address;

  const { type } = socket.handshake.auth;

  if (!type) {
    //타입 없으면 연결 종료
    socket.disconnect();
  }


  if (type === adminType) {
    console.log(`👑 Admin 연결 시도: ${socket.id}`);

    const adminId = MyadminId;

    // ★ 기존 세션이 있으면 재사용, 없을 때만 새로 저장
    if (session.userId === adminId) {
      console.log(`👑 기존 Admin 세션 재사용: ${session.id}`);
      // 세션 쿠키를 다시 발급하지 않음 (클라이언트가 이미 보유)
    } else {
      // ★ 새 세션일 때만: 기존 admin 세션 DB에서 정리
      try {
        const allSessions = sessionDb.prepare(`SELECT sid, sess FROM sessions`).all();
        for (const row of allSessions) {
          try {
            const data = JSON.parse(row.sess);
            if (data.userId === adminId && row.sid !== session.id) {
              sessionDb.prepare(`DELETE FROM sessions WHERE sid = ?`).run(row.sid);
              console.log(`🗑️ 기존 Admin 세션 삭제: ${row.sid}`);
            }
          } catch (e) { /* 무시 */ }
        }
      } catch (e) {
        console.error('Admin 세션 정리 실패:', e);
      }

      session.userId = adminId;
      session.userName = adminType;
      session.userType = adminType;
      session.loginIP = clientIP;
      session.loginTime = new Date().toISOString();

      await new Promise((resolve, reject) => {
        session.save((err) => {
          if (err) {
            console.error('Admin 세션 저장 실패:', err);
            reject(err);
          } else {
            console.log(`✅ Admin 세션 새로 저장: ${session.id}`);
            resolve();
          }
        });
      });

      // ★ 새 세션일 때만 쿠키 발급
      socket.emit('session-created', {
        adminId: adminId,
        sessionId: session.id,
        signedCookie: `${process.env.SESSION_NAME || 'localSessionId'}=${encodeURIComponent(
          's:' + cookieSignature.sign(
            session.id,
            process.env.SESSION_SECRET || 'local-network-secret-key'
          )
        )}`,
      });
    }

     // Admin은 메인과 프로젝트 소켓을 별도로 관리
    const existingAdmin = usersInfo.get(adminId);
    if (existingAdmin) {
      // 기존 Admin 정보 업데이트 (메인 소켓만)
      existingAdmin.mainSocketId = socket.id;
      existingAdmin.ip = clientIP;
      existingAdmin.lastActivity = new Date().toISOString();
      usersInfo.set(adminId, existingAdmin);
    } else {
      // 새 Admin 생성
      usersInfo.set(adminId, JsonBuilder.createUser({
        userId: adminId,
        userLoginId: adminType,
        userName: adminType,
        mainSocketId: socket.id, // 메인 서버 소켓
        projectSocketId: null,    // 프로젝트 네임스페이스 소켓 (나중에 추가)
        type: adminType,
        projectId: null,
        roomId: null,
        status: 'online',
        ip: clientIP,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      }));

      console.log(`✅ Admin 생성: ${adminId}`);
    }

    // 공통 이벤트 등록
    registerCommonEvents(socket, session, type);

    // Admin 전용 이벤트 등록
    registerAdminOnlyEvents(socket, session, type, socketSessionMiddleware);

    return; // Admin 연결은 여기서 종료 (프로젝트 네임스페이스에서 별도 관리)
  }


  // ========== Client 처리 ==========

  // 인증되지 않은 연결 거부
  if (!session.userId) {
    console.log(`❌ Unauthenticated connection rejected: ${socket.id} from ${clientIP}`);
    // socket.emit('auth-required', { 
    //   message: 'Please login first',
    //   serverIP: getLocalIPs()[0]
    // });
    socket.disconnect(true);
    return;
  }

  // 중복 로그인 처리 (내부망이므로 기존 연결 유지 옵션 추가)

  const existingUser = usersInfo.get(session.userId);
  if (existingUser && existingUser.mainSocketId !== socket.id) {
    // 내부망 정책: 같은 IP면 허용, 다른 IP면 기존 종료
    if (existingUser.ip === clientIP) {
      console.log(`ℹ️ Same user reconnecting from same IP: ${session.userId}`);
    } else {
      console.log(`⚠️ Duplicate login from different IP for user ${session.userId}`);
      const oldSocket = io.sockets.sockets.get(existingUser.mainSocketId);
      if (oldSocket) {
        // oldSocket.emit('force-disconnect', { 
        //   reason: 'duplicate-login',
        //   newIP: clientIP
        // });
        oldSocket.disconnect(true);
      }
    }
  }

  // usersInfo에 사용자 추가/업데이트
  if (existingUser) {
    // 기존 정보 업데이트
    usersInfo.set(session.userId, {
      ...usersInfo.get(session.userId), // 기존 정보 유지
      mainSocketId: socket.id,
      projectId: null,
      roomId: null,
      status: 'online',
      ip: clientIP,
      lastActivity: new Date().toISOString()
    });
  } else {
    // 새로 생성 - Admin과 동일한 구조
    usersInfo.set(session.userId, JsonBuilder.createUser({
      userId: session.userId,
      userLoginId: session.userLoginId,
      userName: session.userName,
      mainSocketId: socket.id,
      projectSocketId: null,
      type: clientType,
      projectId: null,
      roomId: null,
      status: 'online',
      ip: clientIP,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }));
  }

  console.log(`✅ User connected: ${session.userName} (ID: ${session.userId}) from ${clientIP}`);



  // 공통 이벤트 등록
  registerCommonEvents(socket, session, type);


});


// ========== 공통 이벤트 핸들러 (Admin & Client 모두 사용) ==========
function registerCommonEvents(socket, session, type) {

  //프로젝트 리스트
  socket.on('project-list', async (data, callback) => {
    console.log(`project-list 요청 받음`);
    try {
      const projects = await projectHandler.selectProjectsNamespace();
      console.log(`프로젝트 리스트 조회 성공: ${projects.length}개 프로젝트`);
      callback({ success: true, projects });
    } catch (err) {
      console.error('프로젝트 리스트 조회 실패:', err);
      callback({ success: false, projects: null });
    }
  });

  // 사용자 관련 이벤트 핸들링
  // userHandler(io, socket, clients, userSockets);
  userHandler(io, socket, usersInfo, MyadminId);

  // 타임라인 관련 이벤트 핸들링
  timelineHandler(io, socket);

  // 개인 전화 관련 이벤트
  directCallHandler.setupDirectCallHandler(io, socket, session, usersInfo);

  // 연결 해제
  socket.on('disconnect', async () => {

    console.log(`[메인서버] 클라이언트 연결 해제 userId : ${session.userId}, type : ${type}, socketId : ${socket.id}`);

    // 사용자 맵에서 제거
    // usersInfo.delete(socket.userId);

    const userInfo = usersInfo.get(session.userId);
    if (!userInfo) return;
    // Admin은 메인 소켓만 제거, projectSocketId는 유지
    if (userInfo.type === adminType) {
      userInfo.mainSocketId = null;
      userInfo.lastActivity = new Date().toISOString();

      // 프로젝트 소켓도 없으면 완전 삭제
      if (!userInfo.projectSocketId) {
        usersInfo.delete(session.userId);
        console.log(`👑 Admin fully disconnected: ${session.userId}`);
      } else {
        usersInfo.set(session.userId, userInfo);
        console.log(`👑 Admin MAIN socket disconnected (project socket still active): ${session.userId}`);
      }
    }
    // Client는 switching 상태로 변경
    else {
      userInfo.status = 'switching';
      userInfo.mainSocketId = null;
      userInfo.lastActivity = new Date().toISOString();
      usersInfo.set(session.userId, userInfo);
    }

  });
}

// ========== Admin 전용 이벤트 핸들러 ==========
function registerAdminOnlyEvents(socket, session, type, socketSessionMiddleware) {


  //프로젝트 만들기
  socket.on('project-create', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false, projects: null });
      return;
    }

    const newId = crypto.randomUUID();
    // projects.set(newId, data.projectName);
    await projectHandler.createProjectNamespace(io, newId, data.projectName, data.duration, usersInfo, socketSessionMiddleware).then(async createdProject => {
      console.log(`프로젝트 ${newId} 생성 완료. ${createdProject.id}`);
      callback({ success: true, projects: createdProject });
    }).catch(async (err) => {
      console.error(`프로젝트 ${newId} 생성 중 오류 발생:`, err);
      callback({ success: false, projects: null });
    });

  });

  //프로젝트 수정하기
  socket.on('project-update', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false, projects: null });
      return;
    }

    await projectHandler.updateProjectNamespace(data.projectId, data.projectName, data.duration).then(async () => {
      console.log(`프로젝트 ${data.projectId} 수정 완료.`);
      callback({ success: true, projects: await projectHandler.selectProjectsNamespace() });
    }).catch(async (err) => {
      console.error(`프로젝트 ${data.projectId} 수정 중 오류 발생:`, err);
      callback({ success: false, projects: null });
    });

  });


  // 프로젝트 삭제하기
  socket.on('project-remove', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false, projects: null });
      return;
    }

    const projectId = data.projectId;

    await projectHandler.deleteProjectNamespace(projectId).then(async (bool) => {
      console.log(`프로젝트 ${projectId} 삭제 완료.`);
      callback({ success: bool, projects: await projectHandler.selectProjectsNamespace() });
    }).catch(async (err) => {
      console.error(`프로젝트 ${projectId} 삭제 중 오류 발생:`, err);
      callback({ success: false, projects: null });
    });

  });





  //프로젝트 재생하기
  socket.on('project-play', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false });
      return;
    }

    const projectId = data.projectId;
    console.log(`프로젝트 ${projectId} 재생 이벤트 요청 받음.`);

    await projectHandler.sendProjectPlay(projectId).then(async () => {
      console.log(`프로젝트 ${projectId} 재생 이벤트 전파 완료.`);
      callback({ success: true });
    }).catch(async (err) => {
      console.error(`프로젝트 ${projectId} 재생 이벤트 전파 중 오류 발생:`, err);
      callback({ success: false });
    });
  });

  //프로젝트 일시정지하기
  socket.on('project-pause', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false });
      return;
    }

    const projectId = data.projectId;

    await projectHandler.sendProjectPause(projectId).then(async () => {
      console.log(`프로젝트 ${projectId} 일시정지 이벤트 전파 완료.`);
      callback({ success: true });
    }).catch(async (err) => {
      console.error(`프로젝트 ${projectId} 일시정지 이벤트 전파 중 오류 발생:`, err);
      callback({ success: false });
    });
  });

  //프로젝트 정지하기
  socket.on('project-stop', async (data, callback) => {

    if (type !== adminType) {
      callback({ success: false });
      return;
    }

    const projectId = data.projectId;

    await projectHandler.sendProjectStop(projectId).then(async () => {
      console.log(`프로젝트 ${projectId} 정지 이벤트 전파 완료.`);
      callback({ success: true });
    }).catch(async (err) => {
      console.error(`프로젝트 ${projectId} 정지 이벤트 전파 중 오류 발생:`, err);
      callback({ success: false });
    });
  });
}


// ========== 서버 활성화/비활성화 ==========
let isServerActivated = false;
let expirationChecker = null;

function activateMainServer() {
  if (isServerActivated) {
    console.log('ℹ️ 서버가 이미 활성화되어 있습니다');
    return;
  }

  isServerActivated = true;

  // ========== 기존 프로젝트 네임스페이스 초기화 ==========
  (async () => {
    try {
      // 초기 네임스페이스 설정
      projectHandler.setupProjectNamespaces(io, usersInfo, socketSessionMiddleware);
      console.log('✅ 프로젝트 네임스페이스 초기화 완료');
    } catch (error) {
      console.error('프로젝트 네임스페이스 초기화 실패:', error);
    }
  })();


  // ========== 메시지 정리 핸들러 시작 ==========
  messageCleanupHandler.initCleanupScheduler();

  // 만료일 체크 시작
  startExpirationChecker();

  console.log('🚀 CuePilot 서비스 활성화 완료');
}



function deactivateMainServer() {
  if (!isServerActivated) return;

  console.log('🛑 서비스 비활성화 중...');

  // 모든 클라이언트에게 알림
  io.emit('server-shutdown', { message: '라이선스 만료로 서비스가 중단됩니다' });

  for (const [nspPath, nsp] of io._nsps) {
    if (nspPath !== '/') {
      nsp.emit('server-shutdown', { message: '라이선스 만료로 서비스가 중단됩니다' });
    }
  }

  // 모든 소켓 연결 해제
  for (const [socketId, socket] of io.sockets.sockets) {
    socket.disconnect(true);
  }

  usersInfo.clear();
  isServerActivated = false;

  if (expirationChecker) {
    clearInterval(expirationChecker);
    expirationChecker = null;
  }

  console.log('✅ 서비스 비활성화 완료');
}


// 만료일 체크 (1시간마다)
function startExpirationChecker() {
  if (expirationChecker) clearInterval(expirationChecker);

  expirationChecker = setInterval(() => {
    if (!licenseManager.isValid) {
      console.log('❌ 라이선스 무효 — 서비스를 중단합니다');
      deactivateMainServer();
      return;
    }

    const expiresAt = new Date(licenseManager.expiresAt);
    const now = new Date();

    if (now >= expiresAt) {
      console.log('❌ 구독 만료일 경과 — 서비스를 중단합니다');
      deactivateMainServer();
      licenseManager.logout();
      return;
    }

    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 3) {
      console.warn(`⚠️ 구독 만료 ${daysLeft}일 전`);
      io.emit('license-warning', {
        message: `구독이 ${daysLeft}일 후 만료됩니다`,
        daysLeft,
      });
    }
  }, 60 * 60 * 1000);
}

// ========== 브라우저 열기 ==========

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') cmd = `start ${url}`;
  else if (platform === 'darwin') cmd = `open ${url}`;
  else cmd = `xdg-open ${url}`;

  exec(cmd, (err) => {
    if (err) console.log(`⚠️ 브라우저를 수동으로 열어주세요: ${url}`);
  });
}

// ========== 시작 ==========

async function bootstrap() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║          🚀 QuePilot Server          ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // 서버 시작 (라이선스 라우트는 항상 동작)
  server.listen(PORT, HOST, () => {

    console.log(`📡 서버 실행: http://localhost:${PORT}`);

    // ★ PID 파일 저장
    const pidPath = path.join(dbDir, 'server.pid');
    fs.writeFileSync(pidPath, process.pid.toString());
    console.log(`📝 PID 저장: ${process.pid} → ${pidPath}`);

    // ★ UDP 디스커버리 서버 시작
    startDiscoveryServer(PORT);

    // 트레이 아이콘 (서비스 모드가 아닐 때만)
    if (process.env.RUNNING_AS_SERVICE !== 'true') {
      try {
        createTray(PORT, () => {
          console.log('🛑 트레이에서 서버 종료 요청');
          try { fs.unlinkSync(pidPath); } catch(e) {}
        });
      } catch (err) {
        console.error('⚠️ 트레이 아이콘 생성 실패:', err.message);
      }

      // openBrowser(`http://localhost:${PORT}/license`);
    }

    console.log(`✅ 서버 시작: http://localhost:${PORT}`);
    
  });

  // 저장된 토큰으로 자동 인증 시도
  console.log('🔑 저장된 인증 정보 확인 중...');
  const isValid = await licenseManager.initialize();

  if (isValid) {
    const expiresAt = new Date(licenseManager.expiresAt);
    const now = new Date();

    if (now >= expiresAt) {
      console.log('❌ 구독이 만료되었습니다. 재로그인이 필요합니다.');
      await licenseManager.logout();
      openBrowser(`http://localhost:${PORT}/license`);
    } else {
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      console.log(`✅ 구독 유효: ${licenseManager.plan} (${licenseManager.companyName})`);
      console.log(`📅 만료일: ${licenseManager.expiresAt} (${daysLeft}일 남음)`);
      console.log(`👥 최대 사용자: ${licenseManager.maxUsers}명`);
      activateMainServer();
    }
  } else {
    console.log('🔑 인증이 필요합니다. 브라우저에서 로그인하세요.');
    console.log(`📡 인증 페이지 : http://localhost:${PORT}/license`);
    openBrowser(`http://localhost:${PORT}/license`);
  }
}




// 종료 처리
process.on('SIGINT', () => {
  console.log('\n🛑 프로그램 종료 중...');
  // deactivateMainServer();

   // 1. 메모리 정리
  usersInfo.clear();

  if (expirationChecker) {
    clearInterval(expirationChecker);
    expirationChecker = null;
  }

  messageCleanupHandler.stopCleanupScheduler(); // 메시지 정리 핸들러 종료

  stopDiscoveryServer();  // ★ 디스커버리 종료
  
   // 2. ★ Socket.IO 먼저 종료 (모든 소켓 연결 해제)
  io.close(() => {
    console.log('✅ Socket.IO 종료 완료');

    // 3. 세션 DB 닫기
    sessionDb.close();

    // 4. HTTP 서버 종료
    server.close(() => {
      console.log('✅ 프로그램 종료 완료');
      process.exit(0);
    });
  });

  // 5. 안전장치: 5초 후 강제 종료
  setTimeout(() => {
    console.log('⚠️ 강제 종료');
    process.exit(1);
  }, 5000);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});


// 서버 부트스트랩 시작
bootstrap();