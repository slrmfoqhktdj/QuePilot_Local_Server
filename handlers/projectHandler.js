// require('dotenv').config();

const projects_dbcontrol = require('../db/controls/projectscontrols');
const rooms_dbcontrol = require('../db/controls/roomscontrols');
const usercontrols = require('../db/controls/usercontrols');

const timelineHandler = require('./timelineHandler');
const directCallHandler = require('./directCallHandler');

const timelineTimerClass = require('../timer/timelinetimer');

const JsonBuilder = require('../utils/jsonBuilder');
// const usercontrols = require('../db/controls/usercontrols');

const adminType = process.env.ADMIN_TYPE || 'admin';
const clientType = process.env.CLIENT_TYPE || 'client';

const {
  initRoomEvents,
  createRoom,
  deleteRoom,
  updateRoom,

} = require('./roomHandler');


// 네임스페이스 저장소
const namespaces = new Map();

// 타임라인 타이머 저장소
const timelineTimers = new Map();

// 프로젝트별 rooms 저장소
const projectRooms = new Map();

async function selectProjectsNamespace() {
  const projects = await projects_dbcontrol.getProjects();
  // console.log('프로젝트 목록 조회 성공:', projects);
  console.log('프로젝트 목록 조회 성공');

  return projects;
}

async function setupCreateProjectNamespace(io, projectId, projectName, usersInfo, socketSessionMiddleware, duration) {
  // 이미 존재하는 네임스페이스는 다시 생성하지 않음
  if (namespaces.has(projectId)) {
    console.log(`[경고] 프로젝트 ${projectId}의 네임스페이스가 이미 존재합니다.`);
    return namespaces.get(projectId);
  }

  console.log(`프로젝트 ID: ${projectId}, 이름: ${projectName} - 네임스페이스 생성`);

  const namespace = io.of(`/${projectId}`);
  const timelineTimer = new timelineTimerClass.TimelineState(projectId, namespace, duration);
  // 프로젝트 전용 rooms 저장소 초기화
  const rooms = new Map();
  projectRooms.set(projectId, rooms);

  // ========================================
  // 세션 미들웨어를 네임스페이스에 등록 (핵심!)
  // ========================================
  if (socketSessionMiddleware) {
    namespace.use(socketSessionMiddleware);
    console.log(`   ✅ Session middleware attached to /${projectId}`);
  } else {
    console.error(`   ❌ WARNING: No session middleware for /${projectId}!`);
  }

  namespace.on('connection', async (socket) => {
    console.log(`[프로젝트 ${projectId}] 클라이언트 연결: ${socket.id}`);

    const session = socket.handshake.session;
    const clientIP = socket.handshake.address;

    console.log(`🔍 [Project ${projectId}] 연결 정보:`, {
      socketId: socket.id,
      ip: clientIP,
      hasSession: !!session,
      sessionId: session ? session.id : 'none',
      userId: session ? session.userId : 'none',
      userType: session ? session.userType : 'none',
      cookie: socket.request.headers.cookie // 쿠키 헤더 확인
    });

    // 인증 확인
    if (!session.userId) {
      console.log(`❌ Unauthenticated connection to project ${projectId}`);
      // socket.emit('auth-required', { message: 'Please login first' });
      socket.disconnect(true);
      return;
    }


    // const auth = socket.handshake.auth;

    // const {type,userId} = auth;

    // if(!type){
    //   //타입 없으면 연결 종료
    //   socket.disconnect();
    //   return;
    // }

    // if(type === adminType){
    //   console.log(`관리자 연결: id = ${socket.userId}, socketId = ${socket.id}`);
    //   socket.userId = adminType;
    //   usersInfo.set(socket.userId, JsonBuilder.createUser({
    //     userId: socket.userId,
    //     userName: socket.userId,
    //     socketId: socket.id,
    //   }));
    // } else if(type === clientType){
    //   console.log(`클라이언트 연결: id = ${userId}, socketId = ${socket.id}`);

    //   if(!userId){
    //     //유저 아이디 없으면 연결 종료
    //     socket.disconnect();
    //     return;
    //   }

    //   if(usersInfo.has(userId)){
    //     //이미 연결된 유저면 연결 종료
    //     socket.disconnect();
    //     return;
    //   }

    //   await usercontrols.getUsersById(userId).then(async result => {

    //     if(result == null) {
    //       //정보 없으면 연결 종료
    //       socket.disconnect();
    //       return;
    //     }

    //     // 클라이언트 소켓에 추가
    //     socket.userId = result.id;

    //     console.log(`클라이언트 정보체 생성 : id = ${result.id}, nick_name = ${result.nick_name}, socketId = ${socket.id}`);

    //     usersInfo.set(result.id, JsonBuilder.createUser({
    //       userId: result.id,
    //       userName: result.nick_name,
    //       socketId: socket.id,
    //       projectId: projectId,
    //     }));
        
    //   }).catch(err => {
    //     console.error('사용자 생성 실패:', err);
    //     socket.disconnect();
    //   });
    // }


     // ========== Admin 처리 (프로젝트 네임스페이스용) ==========
    if (session.userType === adminType) {
      const userInfo = usersInfo.get(session.userId);
      
      if (userInfo) {
        // 기존 Admin 정보 업데이트 (프로젝트 소켓 추가)
        userInfo.projectId = projectId;
        userInfo.projectSocketId = socket.id; // 프로젝트 네임스페이스 소켓
        userInfo.status = 'online';
        userInfo.lastActivity = new Date().toISOString();
        usersInfo.set(session.userId, userInfo);
        
        console.log(`👑 Admin entered project ${projectId} from ${clientIP}`);
        console.log(`   - Main socket: ${userInfo.mainSocketId}`);
        console.log(`   - Project socket: ${userInfo.projectSocketId}`);
      } else {
        // // Admin이 메인 서버 연결 없이 프로젝트에 직접 연결 (비정상)
        // console.log(`⚠️ Admin connected to project without main connection`);
        // // socket.emit('error', { message: 'Please connect to main server first' });
        // socket.disconnect(true);
        // return;


        // ★★★ 수정: 강제 disconnect 대신 세션으로 복원 ★★★
        console.log(`⚠️ Admin connected to project without main connection — restoring from session`);
        
        usersInfo.set(session.userId, JsonBuilder.createUser({
          userId: session.userId,
          userName: session.userName || adminType,
          mainSocketId: null,
          projectSocketId: socket.id,
          type: adminType,
          projectId: projectId,
          roomId: null,
          status: 'online',
          ip: clientIP,
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        }));
        
        console.log(`👑 Admin restored and entered project ${projectId}`);
      }
    }
    // ========== Client 처리 ==========
    else if (session.userId) {
      // 중복 연결 체크
      const existingUser = usersInfo.get(session.userId);
      if (existingUser && existingUser.projectId === projectId && existingUser.projectSocketId !== socket.id) {
        if (existingUser.ip === clientIP) {
          console.log(`ℹ️ User ${session.userId} reconnecting to project ${projectId}`);
        } else {
          console.log(`⚠️ Duplicate project connection from different IP for user ${session.userId}`);
          // socket.emit('error', { 
          //   message: 'Already connected to this project from another device',
          //   existingIP: existingUser.ip
          // });
          socket.disconnect(true);
          return;
        }
      }

      // usersInfo 업데이트 또는 복원
      if (existingUser) {
        existingUser.projectId = projectId;
        existingUser.projectSocketId = socket.id;
        existingUser.status = 'online';
        existingUser.ip = clientIP;
        existingUser.lastActivity = new Date().toISOString();
        usersInfo.set(session.userId, existingUser);
      } else {
        // DB에서 사용자 정보 조회
        const userResult = await usercontrols.getUsersById(session.userId);
        if (!userResult || !userResult.id) {
          console.log(`❌ User not found in DB: ${session.userId}`);
          // socket.emit('error', { message: 'User not found' });
          socket.disconnect(true);
          return;
        }

        usersInfo.set(session.userId, JsonBuilder.createUser({
          userId: session.userId,
          userName: session.userName,
          mainSocketId: null,
          projectSocketId: socket.id,
          type: clientType,
          projectId: projectId,
          roomId: null,
          status: 'online',
          ip: clientIP,
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        }));
      }

      console.log(`✅ Client ${session.userName} entered project ${projectId} from ${clientIP}`);
    }


    // 초기 방 목록 설정
    await rooms_dbcontrol.getRoomsByProjectId(projectId).then(async initialRooms => {
      await initRoomEvents(socket, namespace, usersInfo, projectId, initialRooms, rooms);
    });

    // 방 목록
    socket.on('room-list', async (data, callback) => {
      await rooms_dbcontrol.getRoomsByProjectId(projectId).then(roomsList => {
        console.log(`[프로젝트 ${projectId}] 방 목록 조회 성공`);
        callback({ success: true, rooms: roomsList });
      }).catch(err => {
        console.log(`[프로젝트 ${projectId}] 방 목록 조회 실패:`, err);
        callback({ success: false, rooms: [] });
        throw err;
      });
    });

    // 방 생성
    socket.on('create-room', async (data, callback) => {
      const session = socket.handshake.session;
      if (!session || session.userType !== adminType) {
        callback({ success: false });
        return;
      }
      const roomId = crypto.randomUUID();
      await createRoom(roomId, data.roomName, projectId, rooms).then(async (result) => {
        console.log(`[프로젝트 ${projectId}] 방 생성 성공: ${roomId}`);
        namespace.emit('room-created', result);
        callback({ success: true });
      }).catch(err => {
        console.error(`[프로젝트 ${projectId}] 방 생성 실패:`, err);
        callback({ success: false });
        throw err;
      });
    });

    // 방 삭제
    socket.on('delete-room', async (data, callback) => {
      const session = socket.handshake.session;
      if (!session || session.userType !== adminType) {
        callback({ success: false });
        return;
      }
      await deleteRoom(data.roomId,rooms).then(async (bool) => {
        console.log(`[프로젝트 ${projectId}] 방 삭제 성공: ${data.roomId}`);
        namespace.emit('room-deleted', { roomId: data.roomId });
        callback({ success: bool });
      }).catch(err => {
        console.error(`[프로젝트 ${projectId}] 방 삭제 실패:`, err);
        callback({ success: false });
        throw err;
      });
    });

    // 방 수정
    socket.on('update-room', async (data, callback) => {
      const session = socket.handshake.session;
      if (!session || session.userType !== adminType) {
        const authorized = data && data.roomId
          ? await usercontrols.getBoolUserRoomAuthByIds(data.roomId, session.userId)
          : false;
        if (!authorized) {
          callback({ success: false });
          return;
        }
      }
      await updateRoom(data.roomId, data.roomName, rooms).then(async () => {
        console.log(`[프로젝트 ${projectId}] 방 수정 성공: ${data.roomId}`);
        namespace.emit('room-updated', { roomId: data.roomId, roomName: data.roomName });
        callback({ success: true });
      }).catch(err => {
        console.error(`[프로젝트 ${projectId}] 방 수정 실패:`, err);
        callback({ success: false });
        throw err;
      });
    });

    // 프로젝트 전체 메시지
    socket.on('project-message-whole', (data, callback) => {
      // 받은 프로젝트 전체 메시지를 해당 네임스페이스의 모든 클라이언트에게 전송
      try{
        // const message = {
        //   socketId: socket.id,
        //   fromUsername: socket.handshake.auth.type,
        //   message: data.message,
        //   timestamp: new Date()
        // };

        const message = JsonBuilder.createMessage({
          // toUserId: null,
          // toUsername: null,
          fromUserId: session.userId,
          fromUsername: socket.handshake.auth.type,
          message: data.message,
          timestamp: new Date(), 
        });

        namespace.emit('receive-message-project-whole', message);
        console.log(`[프로젝트 ${projectId}] 전체 메시지 전파`);
        callback({ success: true });
      }catch(err){
        console.error(`[프로젝트 ${projectId}] 전체 메시지 전파 실패:`, err);
        callback({ success: false });
        throw err;
      }
      
    });

    // Heartbeat
    socket.on('heartbeat', () => {
      const userInfo = usersInfo.get(session.userId);
      if (userInfo) {
        userInfo.lastActivity = new Date().toISOString();
        usersInfo.set(session.userId, userInfo);
      }
      socket.emit('heartbeat-ack', { serverTime: Date.now() });
    });

    // 연결 해제
    socket.on('disconnect', async () => {

      console.log(`🔌 Project namespace disconnected: ${socket.id}`);

      const userId = session.userId;
      if (!userId) return;

      const userInfo = usersInfo.get(userId);
      if (!userInfo) return;

      // ★★★ 추가: 이 소켓이 현재 프로젝트 소켓인지 확인 ★★★
      if (userInfo.projectSocketId !== socket.id) {
        console.log(`⚠️ 이미 교체된 프로젝트 소켓의 disconnect — 무시 (current: ${userInfo.projectSocketId}, this: ${socket.id})`);
        return;
      }

      // 방에서 제거
      if (userInfo.roomId) {
        namespace.to(userInfo.roomId).emit('user-left', {
          socketId: socket.id,
          userId: userId,
          userName: userInfo.userName
        });
      }

      if (session.userType === adminType) {
        userInfo.projectSocketId = null;
        userInfo.projectId = null;
        userInfo.roomId = null;
        userInfo.lastActivity = new Date().toISOString();
        
        // ★★★ 수정: 항상 유지 (삭제하지 않음) ★★★
        usersInfo.set(userId, userInfo);
        console.log(`👑 Admin PROJECT socket disconnected (mainSocket: ${userInfo.mainSocketId || 'null'})`);
      } else {
        usersInfo.delete(userId);
        console.log(`👋 Client ${userInfo.userName} left project ${projectId}`);
      }

      console.log(`[프로젝트 ${projectId}] 클라이언트 연결 해제: ${userId}, socketId: ${socket.id}`);
    });


    ////////////////////////////////////////////////////////////////////////////////// 타임라인 수정 ////////////////////////////////////////////////////////////////////////////////// 

    // // 타임라인 업데이트 이벤트 수신
    // socket.on('timeline-updated', (data) => {
    //   // 받은 타임라인 데이터를 해당 네임스페이스의 모든 클라이언트에게 전송
    //   namespace.emit('timeline-updated', data);
    //   console.log(`[프로젝트 ${projectId}] 타임라인 업데이트 이벤트 전파:`, data);
    // });

    // socket.on('cue-added', (data) => {
    //   // 받은 큐 추가 데이터를 해당 네임스페이스의 모든 클라이언트에게 전송
    //   namespace.emit('cue-added', data);
    //   console.log(`[프로젝트 ${projectId}] 큐 추가 이벤트 전파:`, data);
    // });

    // socket.on('cue-updated', (data) => {
    //   // 받은 큐 업데이트 데이터를 해당 네임스페이스의 모든 클라이언트에게 전송
    //   namespace.emit('cue-updated', data);
    //   console.log(`[프로젝트 ${projectId}] 큐 업데이트 이벤트 전파:`, data);
    // });

    // socket.on('cue-deleted', (data) => {
    //   // 받은 큐 삭제 데이터를 해당 네임스페이스의 모든 클라이언트에게 전송
    //   namespace.emit('cue-deleted', data);
    //   console.log(`[프로젝트 ${projectId}] 큐 삭제 이벤트 전파:`, data);
    // });

    // socket.on('track-added', (data) => {
    //   // 받은 트랙 추가 데이터를 해당 네임스페이스의 모든 클라이언트에게 전송
    //   namespace.emit('track-added', data);
    //   console.log(`[프로젝트 ${projectId}] 트랙 추가 이벤트 전파:`, data);
    // });

    // 타임라인 관련 이벤트 핸들링
    timelineHandler(io, socket);

    // 개인 전화 관련 이벤트
    directCallHandler.setupDirectCallHandler(io, socket, session, usersInfo);

  });

  timelineTimers.set(projectId, timelineTimer);
  namespaces.set(projectId, namespace);
  return namespace;
}


async function setupProjectNamespaces(io, usersInfo, socketSessionMiddleware) {
  // 초기 프로젝트들에 대해 네임스페이스 생성
  const projects = await selectProjectsNamespace();
  projects.forEach(project => {
      setupCreateProjectNamespace(io, project.id, project.name, usersInfo, socketSessionMiddleware, project.duration);
  });

}

// function getNamespace(projectId) {
//   return namespaces.get(projectId);
// }

async function sendProjectPlay(projectId, time) {
  const timer = timelineTimers.get(projectId);
  if (!timer) {
    console.log(`[프로젝트 ${projectId}] 타이머 없음 — 재생 불가`);
    return false;
  }
  const result = timer.play(time);
  console.log(`[프로젝트 ${projectId}] 재생 이벤트 전파: ${time}`);
  return result;
}

async function sendProjectPause(projectId, time) {
  const timer = timelineTimers.get(projectId);
  if (!timer) {
    console.log(`[프로젝트 ${projectId}] 타이머 없음 — 일시정지 불가`);
    return false;
  }
  const result = timer.pause(time);
  console.log(`[프로젝트 ${projectId}] 일시정지 이벤트 전파: ${time}`);
  return result;
}

async function sendProjectStop(projectId) {
  const timer = timelineTimers.get(projectId);
  if (!timer) {
    console.log(`[프로젝트 ${projectId}] 타이머 없음 — 정지 불가`);
    return false;
  }
  timer.stop();
  console.log(`[프로젝트 ${projectId}] 정지 이벤트 전파`);
  return true;
}



async function createProjectNamespace(io, id , name, duration, usersInfo , socketSessionMiddleware) {

  try{
    const result = await projects_dbcontrol.createProject(id, name, duration)
    console.log('프로젝트 생성 성공:', result);
    setupCreateProjectNamespace(io, id, name, usersInfo, socketSessionMiddleware, duration);
    return result;
  
  }catch(err){
    console.error('프로젝트 생성 실패:', err);
    throw err;
  }

}

async function deleteProjectNamespace(projectId) {
   const namespace = namespaces.get(projectId);
  if (namespace) {
    await projects_dbcontrol.deleteProject(projectId).then(result => {
      console.log('프로젝트 방 삭제 성공:', result);
      // 네임스페이스 제거
      namespace.removeAllListeners();
      console.log(`프로젝트 ${projectId}의 네임스페이스가 삭제되었습니다.`);
    }).catch(err => {
      console.error('프로젝트 방 삭제 실패:', err);
      throw err;
    });

  }

  timelineTimers.delete(projectId);
  projectRooms.delete(projectId);
  return namespaces.delete(projectId);
}

async function updateProjectNamespace(projectId, name, duration) {
  const namespace = namespaces.get(projectId);
  if (namespace) {
    // 네임스페이스 이름 변경 로직 
    await projects_dbcontrol.updateProject(projectId,name, duration).then(result => {
      console.log('프로젝트 이름 수정 성공:', result);
    }).catch(err => {
      console.error('프로젝트 이름 수정 실패:', err);
      throw err;
    });

    // 타이머 duration 업데이트
    const timer = timelineTimers.get(projectId);
    if (timer) {
      timer.setDuration(duration);
      console.log(`[프로젝트 ${projectId}] Duration 업데이트: ${duration}s`);
    }
  }
}

module.exports = {
  setupProjectNamespaces,
  createProjectNamespace,
  // getNamespace,
  deleteProjectNamespace,
  updateProjectNamespace,
  selectProjectsNamespace,
  sendProjectPlay,
  sendProjectPause,
  sendProjectStop,
  // namespaces
};