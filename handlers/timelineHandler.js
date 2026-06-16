const timeline_dbcontrol = require('../db/controls/timelinecontrols');


module.exports = function timelineHandler(io, socket) {

  // 타임라인 목록 가져오기
  socket.on('timeline-list', async (data, callback) => {
    await timeline_dbcontrol.getTimelinesAll().then(timelinesList => {
      console.log(`프로젝트 타임라인 목록 조회 성공`);
      callback({ success: true, timelines: timelinesList });
    }).catch(err => {
      console.log(`프로젝트 타임라인 목록 조회 실패:`, err);
      callback({ success: false, timelines: [] });
    });
  });


  // 타임라인 목록 가져오기
  socket.on('project-timeline-room', async (data, callback) => {
    await timeline_dbcontrol.getTimelinesByProjectId(data.projectId).then(timelinesRooms => {
      console.log(`프로젝트 타임라인 목록 조회 성공`);
      callback({ success: true, data: timelinesRooms });
    }).catch(err => {
      console.log(`프로젝트 타임라인 목록 조회 실패:`, err);
      callback({ success: false, data: null });
    });
  });


  // // 타임라인 추가 전 방 목록 가져오기
  // socket.on('timeline-room-list', async (data, callback) => {
  //     const projectId = data.projectId;
  //     await rooms_dbcontrol.getRoomsByProjectId(projectId).then(roomsList => {
  //       console.log(`[프로젝트 ${projectId}] 방 목록 조회 성공`);
  //       callback({ success: true, rooms: roomsList });
  //     }).catch(err => {
  //       console.log(`[프로젝트 ${projectId}] 방 목록 조회 실패:`, err);
  //       callback({ success: false, rooms: [] });
  //     });
  
  // });
    
  // 타임라인 생성
  socket.on('create-track', async (data, callback) => {

    const trackId = crypto.randomUUID();

    await timeline_dbcontrol.createTimeline(trackId, data.name, data.roomId, data.cues).then(result => {
      console.log(`프로젝트 트랙 생성 성공`);

      if(data.projectId == data.roomId){
        io.of(`/${data.projectId}`).emit('track-added', {track: result});
      }else{
        io.of(`/${data.projectId}`).to(data.roomId).emit('track-added', {track: result});
      }

      const auth = socket.handshake.auth;
      const {type,name} = auth;

      // 클라이언트 타입이면 전체 네임스페이스에 트랙 추가 이벤트 전송 - 관리자에게 전송해야하기 때문
      if(type === 'client'){
        // io.of('/').emit('track-added', {track: result});
        //관리자에게만 전송
        const allSockets = io.of('/').sockets;
        allSockets.forEach((socket) => {
          if (socket.handshake.auth.type === 'admin') {
            socket.emit('track-added', {projectId : data.projectId,track: result});
            return; // 관리자에게만 전송하므로 루프 종료
          }
        });
      }

      callback({ success: true, track: result });
    }).catch(err => {
      console.log(`프로젝트 트랙 생성 실패:`, err);
      callback({ success: false, track: null });
    });
  });

  // 타임라인 업데이트
  socket.on('update-track', async (data, callback) => {
    
    await timeline_dbcontrol.updateTimeline(data.trackId, data.name, data.roomId, data.cues).then(result => {
      console.log(`프로젝트 트랙 업데이트 성공`);

      if(data.projectId == data.roomId){
        io.of(`/${data.projectId}`).emit('track-updated', {track: result});
      }else{
        io.of(`/${data.projectId}`).to(data.roomId).emit('track-updated',{track: result});
      }

      const auth = socket.handshake.auth;
      const {type,name} = auth;


      // 클라이언트 타입이면 전체 네임스페이스에 트랙 추가 이벤트 전송 - 관리자에게 전송해야하기 때문
      if(type === 'client'){
        // io.of('/').emit('track-updated', {track: result});
        //관리자에게만 전송
        console.log(`클라이언트 ${type}이 트랙 수정 이벤트 전송, 관리자에게만 전송`);
        const allSockets = io.of('/').sockets;
        allSockets.forEach((socket) => {
          if (socket.handshake.auth.type === 'admin') {
            console.log(`클라이언트 ${type}이 트랙 수정 이벤트 전송 관리자 ${socket.handshake.auth.name}에게 전송`);
            socket.emit('track-updated', {projectId : data.projectId, track: result});
            return; // 관리자에게만 전송하므로 루프 종료
          }
        });
      }

      callback({ success: true, track: result });
    }).catch(err => {
      console.log(`프로젝트 트랙 업데이트 실패:`, err);
      callback({ success: false, track: null });
    });
  });

  // 타임라인 삭제
  socket.on('delete-track', async (data, callback) => {

    await timeline_dbcontrol.deleteTimeline(data.trackId).then(result => {
      console.log(`프로젝트 트랙 삭제 성공`);

      if(data.projectId == data.roomId){
        io.of(`/${data.projectId}`).emit('track-deleted', {trackId: data.trackId});
      }else{
        io.of(`/${data.projectId}`).to(data.roomId).emit('track-deleted',{trackId: data.trackId});
      }

      const auth = socket.handshake.auth;
      const {type,name} = auth;


      // 클라이언트 타입이면 전체 네임스페이스에 트랙 추가 이벤트 전송 - 관리자에게 전송해야하기 때문
      if(type === 'client'){
        // io.of('/').emit('track-updated', {track: result});
        //관리자에게만 전송
        console.log(`클라이언트 ${type}이 트랙 삭제 이벤트 전송, 관리자에게만 전송`);
        const allSockets = io.of('/').sockets;
        allSockets.forEach((socket) => {
          if (socket.handshake.auth.type === 'admin') {
            console.log(`클라이언트 ${type}이 트랙 삭제 이벤트 전송 관리자 ${socket.handshake.auth.name}에게 전송`);
            socket.emit('track-deleted', {projectId : data.projectId , trackId: data.trackId});
            return; // 관리자에게만 전송하므로 루프 종료
          }
        });
      }

      callback({ success: true, trackId: data.trackId });
    }).catch(err => {
      console.log(`프로젝트 트랙 삭제 실패:`, err);
      callback({ success: false, trackId: null });
    });
  });

  

};