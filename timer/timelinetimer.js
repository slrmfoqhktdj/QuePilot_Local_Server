class TimelineState {
  constructor(projectId, namespace, duration) {
    this.projectId = projectId;
    this.namespace = namespace;
    this.isPlaying = false;
    this.currentTime = 0;
    this.playbackSpeed = 1.0;
    this.duration = duration || 120;
    this.startedAt = null;
    this.pausedAt = null;
    this.lastBroadcast = 0;
    this.heartbeatTimer = null;
    this.syncInterval = 1000; // 1000ms마다 동기화 (조절 가능)
  }

  play(time) {
    if (this.isPlaying) {
      console.log(`[${this.projectId}] 이미 재생 중 — 무시`);
      return false;
    }

    if (time != null) {
      this.currentTime = Math.max(0, Math.min(time, this.duration));
    }
    
    this.isPlaying = true;
    this.startedAt = Date.now() - (this.currentTime * 1000 / this.playbackSpeed);
    this.pausedAt = null;

    const data = {
      projectId: this.projectId,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      playbackSpeed: this.playbackSpeed,
      duration: this.duration,
      serverTime: Date.now()
    }
    
    this.namespace.emit('project-play', data);
    this.startHeartbeat();
    
    console.log(`[${this.projectId}] Playing from ${this.currentTime}s`);
    return true;
  }

  pause(time) {
    if (!this.isPlaying) {
      console.log(`[${this.projectId}] 재생 중이 아님 — 무시`);
      return false;
    }
    
    if (time != null) {
      this.currentTime = Math.max(0, Math.min(time, this.duration));
    } else {
      this.currentTime = this.getCurrentTime();
    }

    this.isPlaying = false;
    this.pausedAt = Date.now();
    this.stopHeartbeat();

    const data = {
      projectId: this.projectId,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      playbackSpeed: this.playbackSpeed,
      duration: this.duration,
      serverTime: Date.now()
    }

    this.namespace.emit('project-pause', data);
    
    console.log(`[${this.projectId}] Paused at ${this.currentTime}s`);
    return true;
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.startedAt = null;
    this.pausedAt = null;
    
    this.stopHeartbeat();

    const data = {
      projectId: this.projectId,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
    }

    this.namespace.emit('project-stop',data);
    
    console.log(`[${this.projectId}] Stopped`);

    return data;
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
    
    if (this.isPlaying) {
      // 재생 중이면 시작 시간 재계산
      this.startedAt = Date.now() - (this.currentTime * 1000 / this.playbackSpeed);
    }
    
    console.log(`[${this.projectId}] Seeked to ${this.currentTime}s`);
  }

  setSpeed(speed) {
    const wasPlaying = this.isPlaying;
    
    if (wasPlaying) {
      // 현재 시간 저장
      this.currentTime = this.getCurrentTime();
    }
    
    this.playbackSpeed = speed;
    
    if (wasPlaying) {
      // 새로운 속도로 시작 시간 재계산
      this.startedAt = Date.now() - (this.currentTime * 1000 / this.playbackSpeed);
    }
    
    console.log(`[${this.projectId}] Speed changed to ${speed}x`);
  }

  getCurrentTime() {
    if (!this.isPlaying) {
      // console.log(`[${this.projectId}] Pausing... 1 ${this.currentTime}s`);
      return this.currentTime;
    }
    
    const elapsed = (Date.now() - this.startedAt) * this.playbackSpeed / 1000;
    const time = Math.min(elapsed, this.duration);
    
    // console.log(`[${this.projectId}] Pausing... 2 ${time}s`);

    // 끝에 도달하면 자동 정지
    if (time >= this.duration) {
      this.stop();
      // 네임스페이스에 정지 알림
      this.namespace.emit('timeline-auto-stopped', {
        reason: 'ended',
        state: this.getState()
      });
      return this.duration;
    }
    
    return time;
  }

  // 하트비트: 재생 중일 때만 주기적으로 동기화
  startHeartbeat() {
    this.stopHeartbeat();
    
    // 재생 중일 때만 주기적으로 상태 브로드캐스트
    this.heartbeatTimer = setInterval(() => {
      if (!this.isPlaying) {
        this.stopHeartbeat();
        return;
      }

      const currentTime = this.getCurrentTime();
      // console.log(`[${this.projectId}] Current time2: ${this.getCurrentTime()}`);
      const now = Date.now();
      
      // 너무 자주 전송하지 않도록 제한
      if (now - this.lastBroadcast < this.syncInterval) {
        return;
      }
      
      this.lastBroadcast = now;
      
      // 상태 브로드캐스트
      this.namespace.emit('timeline-heartbeat', {
        projectId: this.projectId,
        isPlaying: this.isPlaying,
        currentTime: currentTime,
        playbackSpeed: this.playbackSpeed,
        duration: this.duration,
        serverTime: now
      });
      
      // this.currentTime = currentTime; // 동기화 목적
      // console.log(`[${this.projectId}] Heartbeat: ${currentTime.toFixed(2)}s`);

    }, this.syncInterval); // 1000ms 체크 (실제 전송은 syncInterval 따름)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log(`[${this.projectId}] Heartbeat stopped : ${this.getCurrentTime()}s `);
    }
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      playbackSpeed: this.playbackSpeed,
      duration: this.duration,
      serverTime: Date.now()
    };
  }

  setDuration(duration) {
    this.duration = duration;
  }

  // 동기화 간격 조정 (ms)
  setSyncInterval(interval) {
    this.syncInterval = Math.max(100, interval); // 최소 100ms
  }

  // 정리
  cleanup() {
    this.stopHeartbeat();
  }
}

module.exports = { 
    TimelineState,
};