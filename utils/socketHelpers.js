class socketHelpers {

    // 유저에게 이벤트 전송( 어느 네임스페이스에 있든 도달)
    static emitToUser(io, usersInfo, userId, event, data) {
        const info = usersInfo.get(userId);
        if (!info) {
            console.log(`⚠ [emitToUser] 사용자 ${userId} 정보 없음`);
            return false;
        }

        // 1순위: 메인 네임스페이스 소켓
        if (info.mainSocketId) {
            const socket = io.sockets.sockets.get(info.mainSocketId);
            if (socket?.connected) {
                socket.emit(event, data);
                console.log(`📨 [emitToUser] ${event} → ${userId} via main(${info.mainSocketId})`);
                return true;
            }
        }

        // 2순위: 프로젝트 네임스페이스 소켓
        if (info.projectSocketId && info.projectId) {
            const ns = io.of('/' + info.projectId);
            const socket = ns.sockets.get(info.projectSocketId);
            if (socket?.connected) {
                socket.emit(event, data);
                console.log(`📨 [emitToUser] ${event} → ${userId} via project /${info.projectId}(${info.projectSocketId})`);
                return true;
            }
        }

        console.log(`⚠ [emitToUser] ${userId} 소켓 없음 (오프라인)`);
        return false;
    }
        


}

module.exports = socketHelpers;