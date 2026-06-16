const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { dbDir } = require('../db/filePaths');

const LICENSE_FILE = path.join(dbDir, '.license');
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://quepilot.license.gracetech.co.kr';

class LicenseManager {
  constructor() {
    this._token = null;
    this._account = null;
    this._licenseData = null;
    this._refreshTimer = null;
    this._isValid = false;
    this._lastOnlineCheck = null;  // ✅ 추가
    this._offlineGraceDays = 7;    // ✅ 추가: 오프라인 유예 7일
  }

  // ========== Getter ==========

  get isValid() {
    return this._isValid;
  }
  get account() {
    return this._account || '';
  }
  get plan() {
    return this._licenseData?.plan || 'none';
  }
  get maxUsers() {
    return this._licenseData?.maxUsers || 0;
  }
  get companyName() {
    return this._licenseData?.companyName || '';
  }
  get expiresAt() {
    return this._licenseData?.expiresAt || '';
  }

  // ========== 머신 고유 ID ==========

  getMachineId() {
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
  }

  // ========== 로그인 (중앙 서버 인증) ==========

  async login(email, password) {
    try {
      const response = await fetch(`${LICENSE_SERVER}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          // machineId: this.getMachineId(),
        }),
      });

      const data = await response.json();

      if (data.success && data.subscription?.isActive) {
        this._token = data.token;
        this._account = email;
        this._licenseData = {
          plan: data.subscription.plan,
          maxUsers: data.subscription.maxUsers,
          companyName: data.subscription.companyName,
          expiresAt: data.subscription.expiresAt,
        };
        this._isValid = true;
        this._lastOnlineCheck = new Date().toISOString();  // ✅ 추가
        this._saveToken();
        this._startRefreshTimer();

        console.log(`✅ 구독 인증 성공: ${email} `);
        return { success: true };
      } else if (data.success && !data.subscription?.isActive) {
        return { success: false, message: '구독이 만료되었습니다. 갱신해주세요.' };
      } else {
        return { success: false, message: data.message || '아이디 또는 비밀번호가 올바르지 않습니다' };
      }
    } catch (e) {
      console.error('❌ 구독 서버 연결 실패:', e.message);
      return { success: false, message: '구독 서버에 연결할 수 없습니다' };
    }
  }

  // ========== 토큰 갱신 ==========

  async refresh() {
    if (!this._token) return;

    try {
      const response = await fetch(`${LICENSE_SERVER}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        this._token = data.token;
        this._licenseData = {
          plan: data.subscription.plan,
          maxUsers: data.subscription.maxUsers,
          companyName: data.subscription.companyName,
          expiresAt: data.subscription.expiresAt,
        };
        this._isValid = true;
        this._lastOnlineCheck = new Date().toISOString();
        this._saveToken();
        console.log('🔄 구독 토큰 갱신 완료');
      } else {
        this._isValid = false;
        console.error('❌ 구독 갱신 실패 — 재로그인 필요');
      }
    } catch (e) {
      if (this._lastOnlineCheck) {
        const lastCheck = new Date(this._lastOnlineCheck);
        const now = new Date();
        const offlineDays = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));

        if (offlineDays <= this._offlineGraceDays) {
          this._isValid = true;  // ✅ 이 줄이 빠져있었음
          console.warn(`⚠️ 구독 서버 연결 불가 — 오프라인 유예 중 (${offlineDays}/${this._offlineGraceDays}일)`);
        } else {
          this._isValid = false;
          console.error(`❌ 오프라인 유예 기간 초과 (${offlineDays}일) — 서비스 중단`);
        }
      } else {
        this._isValid = false;
        console.error('❌ 구독 서버 연결 불가 — 이전 접속 기록 없음');
      }
    }
  }


  // ========== 로그아웃 ==========

  async logout() {
    try {
      if (this._token) {
        await fetch(`${LICENSE_SERVER}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this._token}` },
        });
      }
    } catch (e) { }

    this._token = null;
    this._account = null;
    this._licenseData = null;
    this._isValid = false;

    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }

    this._deleteToken();
    console.log('👋 구독 로그아웃 완료');
  }

  // ========== 서버 시작 시 자동 인증 ==========

  async initialize() {
    if (this._loadToken()) {
      // 토큰 로드 후 만료일 먼저 확인
      if (this._licenseData?.expiresAt) {
        const expiresAt = new Date(this._licenseData.expiresAt);
        if (expiresAt < new Date()) {
          console.log('❌ 저장된 토큰의 구독이 이미 만료됨');
          this._isValid = false;
          return false;
        }
      }

      await this.refresh();
      if (this._isValid) {
        this._startRefreshTimer();
        return true;
      }
    }
    return false;
  }


  // ========== 내부 메서드 ==========

  _startRefreshTimer() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      this.refresh();
    }, 12 * 60 * 60 * 1000); // 12시간마다
  }

  _saveToken() {
    try {
      fs.writeFileSync(
        LICENSE_FILE,
        JSON.stringify({
          token: this._token,
          account: this._account,
          licenseData: this._licenseData,
          lastOnlineCheck: this._lastOnlineCheck,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error('❌ 토큰 저장 실패:', e.message);
    }
  }

  _loadToken() {
    try {
      if (fs.existsSync(LICENSE_FILE)) {
        const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
        this._token = data.token;
        this._account = data.account;
        this._licenseData = data.licenseData;
        this._lastOnlineCheck = data.lastOnlineCheck || null;
        return true;
      }
    } catch (e) {
      console.error('❌ 토큰 로드 실패:', e.message);
    }
    return false;
  }

  _deleteToken() {
    try {
      if (fs.existsSync(LICENSE_FILE)) {
        fs.unlinkSync(LICENSE_FILE);
      }
    } catch (e) { }
  }

  stop() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
    }
  }
}

module.exports = new LicenseManager();
