const schemas = require('../models/commonSchemas');

class JsonBuilder {

    // 
    static createUser(data) {
        return {
            ...schemas.userSchema,
            userId: data.userId,
            userName: data.userName || '',
            mainSocketId: data.mainSocketId || '', // 메인 서버 소켓
            projectSocketId: data.projectSocketId || '',    // 프로젝트 네임스페이스 소켓 (나중에 추가)
            type: data.type || '',
            projectId: data.projectId || '',
            roomId: data.roomId || '',
            status: data.status || '',
            ip: data.ip || '',
            connectedAt: new Date(),
            lastActivity: new Date()
        };
    }

    /**
     * 메시지 객체 생성
     */
    static createMessage(data) {
        return {
            ...schemas.messageSchema,
            fromUserId: data.fromUserId || '',
            fromUsername: data.fromUsername || '',
            // toUserId: data.toUserId || '',
            // toUsername: data.toUsername || '',
            message: data.message || '',
            timestamp: data.timestamp || new Date(),
        };
    }


    // 방 입장/퇴장 알림 객체 생성
    static createRoomUserJoinLeave(data) {
        return {
            ...schemas.roomUserJoinLeaveSchema,
            userId: data.userId || '',
            userName: data.userName || '',
            totalMembers: data.totalMembers || 0,
            timestamp: data.timestamp || new Date(),
        };
    }

    // 통화방 참여자 객체 생성
    static createCallParticipant(data) {
        return {
            ...schemas.callParticipantSchema,
            userId: data.userId || '',
            userName: data.userName || '',
            isMuted: data.isMuted || false,
        };
    }

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

module.exports = JsonBuilder;