// timelinecontrols.js
const db = require('../sqliteDatabase');
const crypto = require('crypto');

// ─── 내부 헬퍼: rows → 타임라인 Map 변환 (다건) ───
async function _rowsToTimelinesMap(rows) {
  const timelinesMap = new Map();

  for (const row of rows) {
    const timelineId = row.timeline_id;

    if (!timelinesMap.has(timelineId)) {
      timelinesMap.set(timelineId, {
        id: timelineId,
        name: row.timeline_name,
        duration: row.duration,
        // fps: row.fps,
        created_at: row.created_at,
        rooms: [],
        tracks: [],
      });
    }

    const timeline = timelinesMap.get(timelineId);

    // 방 추가 (중복 제거)
    if (row.room_id && !timeline.rooms.find(r => r.id === row.room_id)) {
      timeline.rooms.push({
        id: row.room_id,
        name: row.room_name,
        created_at: row.room_created_at,
      });
    }

    // 트랙 및 큐 추가
    if (row.track_id) {
      let track = timeline.tracks.find(t => t.id === row.track_id);

      if (!track) {
        track = {
          id: row.track_id,
          name: row.track_name,
          room_id: row.track_room_id,
          cues: [],
        };
        timeline.tracks.push(track);
      }

      if (row.cue_id) {
        // 큐 중복 방지
        if (!track.cues.find(c => c.id === row.cue_id)) {
          track.cues.push({
            id: row.cue_id,
            startTime: row.start_time,
            duration: row.cue_duration,
            label: row.label,
            comment: row.comment,
            color: row.color,
          });
        }
      }
    }
  }

  return timelinesMap;
}

// ─── 내부 헬퍼: rows → 단일 타임라인 객체 변환 ───
async function _rowsToSingleTimeline(rows, includeRooms = false) {
  if (!rows || rows.length === 0) return null;

  const result = {
    id: null,
    duration: null,
    // fps: null,
    created_at: null,
    tracks: [],
  };
  if (includeRooms) result.rooms = [];

  for (const row of rows) {
    const timelineId = row.timeline_id;

    if (result.id !== timelineId) {
      result.id = timelineId;
      result.name = row.timeline_name || undefined;
      result.duration = row.duration;
    //   result.fps = row.fps;
      result.created_at = row.created_at;
      result.tracks = [];
      if (includeRooms) result.rooms = [];
    }

    // 방 추가 (중복 제거)
    if (includeRooms && row.room_id && !result.rooms.find(r => r.id === row.room_id)) {
      result.rooms.push({
        id: row.room_id,
        name: row.room_name,
        created_at: row.room_created_at,
      });
    }

    // 트랙 및 큐 추가
    if (row.track_id) {
      let track = result.tracks.find(t => t.id === row.track_id);

      if (!track) {
        track = {
          id: row.track_id,
          name: row.track_name,
          room_id: row.track_room_id,
          cues: [],
        };
        result.tracks.push(track);
      }

      if (row.cue_id) {
        if (!track.cues.find(c => c.id === row.cue_id)) {
          track.cues.push({
            id: row.cue_id,
            startTime: row.start_time,
            duration: row.cue_duration,
            label: row.label,
            comment: row.comment,
            color: row.color,
          });
        }
      }
    }
  }

  return result;
}


// ═══════════════════════════════════════════════
//  getTimelinesAll
// ═══════════════════════════════════════════════
async function getTimelinesAll() {
  const query = `
    SELECT
      p.name       AS timeline_name,
      p.created_at,
      p.id         AS timeline_id,
      p.duration,
      r.id         AS room_id,
      r.name       AS room_name,
      r.created_at AS room_created_at,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time,
      c.duration   AS cue_duration
    FROM projects p
    LEFT JOIN rooms  r ON r.project_id = p.id
    LEFT JOIN tracks t ON t.room_id    = r.id
    LEFT JOIN cues   c ON c.track_id   = t.id

    UNION ALL

    SELECT
      p.name       AS timeline_name,
      p.created_at,
      p.id         AS timeline_id,
      p.duration,
      p.id         AS room_id,
      'project Direct' AS room_name,
      p.created_at AS room_created_at,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time,
      c.duration   AS cue_duration
    FROM projects p
    INNER JOIN tracks t ON t.room_id = p.id
    LEFT  JOIN cues   c ON c.track_id = t.id

    ORDER BY created_at ASC, start_time ASC
  `;

  const rows = db.prepare(query).all();

  if (rows.length === 0) return [];

  const timelinesMap = _rowsToTimelinesMap(rows);
  return Array.from(timelinesMap.values());
}


// ═══════════════════════════════════════════════
//  getTimelinesByProjectId
// ═══════════════════════════════════════════════
async function getTimelinesByProjectId(projectId) {
  const query = `
    SELECT
      p.name       AS timeline_name,
      p.created_at AS created_at,
      p.id         AS timeline_id,
      p.duration,
      r.id         AS room_id,
      r.name       AS room_name,
      r.created_at AS room_created_at,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time AS start_time,
      c.duration   AS cue_duration
    FROM projects p
    LEFT JOIN rooms  r ON r.project_id = p.id
    LEFT JOIN tracks t ON t.room_id    = r.id
    LEFT JOIN cues   c ON c.track_id   = t.id
    WHERE p.id = ?

    UNION ALL

    SELECT
      p.name       AS timeline_name,
      p.created_at AS created_at,
      p.id         AS timeline_id,
      p.duration,
      p.id         AS room_id,
      'project Direct' AS room_name,
      p.created_at AS room_created_at,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time AS start_time,
      c.duration   AS cue_duration
    FROM projects p
    INNER JOIN tracks t ON t.room_id = p.id
    LEFT  JOIN cues   c ON c.track_id = t.id
    WHERE p.id = ?

    ORDER BY created_at ASC, start_time ASC
  `;

  const rows = db.prepare(query).all(projectId, projectId);

  if (rows.length === 0) return null;

  return _rowsToSingleTimeline(rows, true);
}


// ═══════════════════════════════════════════════
//  getTimelinesByUser
// ═══════════════════════════════════════════════
async function getTimelinesByUser(projectId, roomId) {
  const query = `
    SELECT
      p.id         AS timeline_id,
      p.created_at,
      p.duration,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time,
      c.duration   AS cue_duration
    FROM projects p
    INNER JOIN rooms  r ON r.project_id = p.id
    INNER JOIN tracks t ON t.room_id    = r.id
    INNER JOIN cues   c ON c.track_id   = t.id
    WHERE p.id = ? AND t.room_id = ?

    UNION ALL

    SELECT
      p.id         AS timeline_id,
      p.created_at,
      p.duration,
      t.id         AS track_id,
      t.name       AS track_name,
      t.room_id    AS track_room_id,
      c.id         AS cue_id,
      c.label,
      c.comment,
      c.color,
      c.start_time,
      c.duration   AS cue_duration
    FROM projects p
    INNER JOIN tracks t ON t.room_id = p.id
    LEFT  JOIN cues   c ON c.track_id = t.id
    WHERE p.id = ?

    ORDER BY start_time ASC
  `;

  const rows = db.prepare(query).all(projectId, roomId, projectId);

  if (rows.length === 0) return null;

  return _rowsToSingleTimeline(rows, false);
}


// ═══════════════════════════════════════════════
//  createTimeline (트랙 + 큐 삽입)
// ═══════════════════════════════════════════════
async function createTimeline(id, name, room_id, cues) {
  console.log('Creating timeline with data');

  const insertTrack = db.prepare(
    'INSERT INTO tracks (id, room_id, name) VALUES (?, ?, ?)'
  );
  const insertCue = db.prepare(
    'INSERT INTO cues (id, label, comment, color, track_id, start_time, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    insertTrack.run(id, room_id, name);

    for (const cue of cues) {
      const cueId = cue.id || crypto.randomUUID();
      cue.id = cueId;
      insertCue.run(cueId, cue.label, cue.comment, cue.color, id, cue.startTime, cue.duration);
    }
  });

  txn();

  return { id, name, room_id, cues };
}


// ═══════════════════════════════════════════════
//  updateTimeline (트랙 업데이트 + 큐 diff 동기화)
//  기존 DB의 큐와 비교해 변경/추가/삭제된 큐만 반영
//  (기존의 전체 삭제 후 재삽입 방식 대비 불필요한 쓰기와
//   created_at 리셋을 방지)
// ═══════════════════════════════════════════════
async function updateTimeline(id, name, room_id, cues) {
  console.log('Updating timeline with data');

  const updateTrack = db.prepare('UPDATE tracks SET name = ?, room_id = ? WHERE id = ?');
  const selectCues  = db.prepare(
    'SELECT id, label, comment, color, start_time, duration FROM cues WHERE track_id = ?'
  );
  const insertCue   = db.prepare(
    'INSERT INTO cues (id, label, comment, color, track_id, start_time, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const updateCue   = db.prepare(
    'UPDATE cues SET label = ?, comment = ?, color = ?, start_time = ?, duration = ? WHERE id = ?'
  );
  const deleteCue   = db.prepare('DELETE FROM cues WHERE id = ?');

  const txn = db.transaction(() => {
    updateTrack.run(name, room_id, id);

    const existingById = new Map(
      selectCues.all(id).map((row) => [row.id, row])
    );
    const incomingIds = new Set();

    for (const cue of cues) {
      const existing = cue.id ? existingById.get(cue.id) : undefined;

      if (!existing) {
        // 신규 큐 (id 없음 또는 DB에 없는 id) → INSERT
        const cueId = cue.id || crypto.randomUUID();
        cue.id = cueId;
        insertCue.run(cueId, cue.label, cue.comment, cue.color, id, cue.startTime, cue.duration);
        incomingIds.add(cueId);
        continue;
      }

      incomingIds.add(cue.id);

      // 변경된 필드가 있을 때만 UPDATE
      if (
        existing.label      !== (cue.label ?? '') ||
        existing.comment    !== (cue.comment ?? '') ||
        existing.color      !== (cue.color ?? '') ||
        existing.start_time !== cue.startTime ||
        existing.duration   !== cue.duration
      ) {
        updateCue.run(cue.label ?? '', cue.comment ?? '', cue.color ?? '', cue.startTime, cue.duration, cue.id);
      }
    }

    // 전송되지 않은 기존 큐 → 삭제
    for (const row of existingById.values()) {
      if (!incomingIds.has(row.id)) {
        deleteCue.run(row.id);
      }
    }
  });

  txn();

  return { id, name, room_id, cues };
}


// ═══════════════════════════════════════════════
//  deleteTimeline (CASCADE로 cues 자동 삭제)
// ═══════════════════════════════════════════════
async function deleteTimeline(id) {
  // database.js에서 tracks → cues CASCADE 설정되어 있으면
  // tracks 삭제 시 cues 자동 삭제됨
  // CASCADE가 없을 경우를 대비해 명시적 삭제도 포함
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM cues WHERE track_id = ?').run(id);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  });

  txn();

  return { id };
}


module.exports = {
  getTimelinesAll,
  getTimelinesByProjectId,
  getTimelinesByUser,
  createTimeline,
  updateTimeline,
  deleteTimeline,
};



// const db = require('../connection');


// async function getTimelinesAll() {
//     try {

//         const query = `
//         SELECT
//             p.name as timeline_name,
//             p.created_at,
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(r.id) as room_id,
//             r.name as room_name,
//             r.created_at as room_created_at,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         LEFT JOIN rooms r ON r.project_id = p.id
//         LEFT JOIN tracks t ON (t.room_id = r.id)
//         LEFT JOIN cues c ON c.track_id = t.id
        
//         UNION ALL
        
//          SELECT 
//             p.name as timeline_name,
//             p.created_at,
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(p.id) as room_id,
//             'project Direct' as room_name,
//             p.created_at as room_created_at,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         INNER JOIN tracks t ON (t.room_id = p.id)
//         LEFT JOIN cues c ON c.track_id = t.id
        
//         ORDER BY created_at ASC, start_time ASC;
//         `;

//         const [rows] = await db.query(query);

//         if (rows.length === 0) {
//         return [];
//         }

//         const timelinesMap = new Map();

//         rows.forEach(row => {
//             const timelineId = row.timeline_id;

//             // console.log(`result :  ${row.timeline_id} , ${row.timeline_name} , ${row.room_id} , ${row.track_id} , ${row.cue_id} , ${row.label}`);

//             if (!timelinesMap.has(timelineId)) {
//                 timelinesMap.set(timelineId, {
//                 id: timelineId,
//                 name: row.timeline_name,
//                 duration: row.duration,
//                 fps: row.fps,
//                 created_at: row.created_at.toISOString(),
//                 rooms: [],
//                 tracks: []
//                 });
//             }


//             const timeline = timelinesMap.get(timelineId);

//             // 방 추가 (중복 제거)
//             if (row.room_id && !timeline.rooms.find(r => r.id === row.room_id)) {
//                 // console.log('Adding room:', row.room_id, row.room_name);
//                 timeline.rooms.push({
//                     id: row.room_id,
//                     name: row.room_name,
//                     created_at: row.room_created_at.toISOString(),
//                 });
//             }

//             // 트랙 및 큐 추가

//             if (row.track_id) {
//                 let track = timeline.tracks.find(t => t.id === row.track_id);
                
//                 if (!track) {
//                 track = {
//                     id: row.track_id,
//                     name: row.track_name,
//                     room_id: row.track_room_id,
//                     cues: []
//                 };
//                 timeline.tracks.push(track);
//                 }

//                 if (row.cue_id) {
//                 track.cues.push({
//                     id: row.cue_id,
//                     startTime: row.start_time,
//                     duration: row.cue_duration,
//                     label: row.label,
//                     comment: row.comment,
//                     color: row.color
//                 });
//                 }
//             }
//         });

//         // console.log(`Fetched timelines with details successfully. ${Array.from(timelinesMap.values())}`);


//         return Array.from(timelinesMap.values());
//     } catch (error) {
//         console.error('Error fetching timelines with details:', error);
//         throw error;
//     }
// }

// async function getTimelinesByProjectId(projectId) {
//     try {

//         const query = `
//         SELECT
//             p.name as timeline_name,
//             p.created_at,
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(r.id) as room_id,
//             r.name as room_name,
//             r.created_at as room_created_at,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         LEFT JOIN rooms r ON r.project_id = p.id
//         LEFT JOIN tracks t ON (t.room_id = r.id)
//         LEFT JOIN cues c ON c.track_id = t.id

//         WHERE p.id = UUID_TO_BIN(?)
        
//         UNION ALL
        
//          SELECT 
//             p.name as timeline_name,
//             p.created_at,
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(p.id) as room_id,
//             'project Direct' as room_name,
//             p.created_at as room_created_at,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         INNER JOIN tracks t ON (t.room_id = p.id)
//         LEFT JOIN cues c ON c.track_id = t.id

//         WHERE p.id = UUID_TO_BIN(?)
        
//         ORDER BY created_at ASC, start_time ASC;
//         `;

//         const [rows] = await db.query(query, [projectId, projectId]);

//         if (rows.length === 0) {
//         return null;
//         }

//         const timelinesMap = {
//             id: null,
//             duration: null,
//             fps: null,
//             tracks: [],
//             created_at: null,
//         };

//         rows.forEach(row => {
//             const timelineId = row.timeline_id;

//             // console.log(`result :  ${row.timeline_id} , ${row.timeline_name} , ${row.room_id} , ${row.track_id} , ${row.cue_id} , ${row.label}`);

//             if (timelinesMap.id != timelineId) {
//                 timelinesMap.id = timelineId;
//                 timelinesMap.name = row.timeline_name;
//                 timelinesMap.duration = row.duration;
//                 timelinesMap.fps = row.fps;
//                 timelinesMap.rooms = [];
//                 timelinesMap.tracks = [];
//                 timelinesMap.created_at = row.created_at.toISOString();
//             }

//             // 방 추가 (중복 제거)
//             if (row.room_id && !timelinesMap.rooms.find(r => r.id === row.room_id)) {
//                 // console.log('Adding room:', row.room_id, row.room_name);
//                 timelinesMap.rooms.push({
//                     id: row.room_id,
//                     name: row.room_name,
//                     created_at: row.room_created_at.toISOString(),
//                 });
//             }

//             // 트랙 및 큐 추가

//             if (row.track_id) {
//                 let track = timelinesMap.tracks.find(t => t.id === row.track_id);
                
//                 if (!track) {
//                 track = {
//                     id: row.track_id,
//                     name: row.track_name,
//                     room_id: row.track_room_id,
//                     cues: []
//                 };
//                 timelinesMap.tracks.push(track);
//                 }

//                 if (row.cue_id) {
//                 track.cues.push({
//                     id: row.cue_id,
//                     startTime: row.start_time,
//                     duration: row.cue_duration,
//                     label: row.label,
//                     comment: row.comment,
//                     color: row.color
//                 });
//                 }
//             }
//         });

//         // console.log(`Fetched timelines with details successfully. ${Array.from(timelinesMap.values())}`);


//         return timelinesMap;
//     } catch (error) {
//         console.error('Error fetching timelines with details:', error);
//         throw error;
//     }
// }

// async function getTimelinesByUser(projectId,roomId) {
//     try {

//         const query = `
//         SELECT
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.created_at,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         INNER JOIN rooms r ON r.project_id = p.id
//         INNER JOIN tracks t ON (t.room_id = r.id)
//         INNER JOIN cues c ON c.track_id = t.id

//         WHERE p.id = UUID_TO_BIN(?) AND t.room_id = UUID_TO_BIN(?)
        
//         UNION ALL
        
//          SELECT 
//             BIN_TO_UUID(p.id) as timeline_id,
//             p.created_at,
//             p.duration,
//             p.fps,
//             BIN_TO_UUID(t.id) as track_id,
//             t.name as track_name,
//             BIN_TO_UUID(t.room_id) as track_room_id,
//             BIN_TO_UUID(c.id) as cue_id,
//             c.label,
//             c.comment,
//             c.color,
//             c.start_time,
//             c.duration as cue_duration
//         FROM projects p
//         INNER JOIN tracks t ON (t.room_id = p.id)
//         LEFT JOIN cues c ON c.track_id = t.id

//         WHERE p.id = UUID_TO_BIN(?)
        
//         ORDER BY start_time ASC;
//         `;

//         const [rows] = await db.query(query, [projectId, roomId, projectId]);

//         if (rows.length === 0) {
//             return null;
//         }

//         const timelinesMap = {
//             id: null,
//             duration: null,
//             fps: null,
//             tracks: [],
//             created_at: null,
//         };
        


//         rows.forEach(row => {

            

//             const timelineId = row.timeline_id;

//             console.log(`result :  ${row.timeline_id} , ${row.track_room_id} , ${row.track_id} , ${row.cue_id} , ${row.label}`);

//             if (timelinesMap.id != timelineId) {
//                 timelinesMap.id = timelineId;
//                 timelinesMap.duration = row.duration;
//                 timelinesMap.fps = row.fps;
//                 timelinesMap.tracks = [];
//                 timelinesMap.created_at = row.created_at.toISOString();
//             }

//             // 트랙 및 큐 추가

//             if (row.track_id) {
//                 let track = timelinesMap.tracks.find(t => t.id === row.track_id);
                
//                 if (!track) {
//                 track = {
//                     id: row.track_id,
//                     name: row.track_name,
//                     room_id: row.track_room_id,
//                     cues: []
//                 };
//                 timelinesMap.tracks.push(track);
//                 }

//                 if (row.cue_id) {
//                 track.cues.push({
//                     id: row.cue_id,
//                     startTime: row.start_time,
//                     duration: row.cue_duration,
//                     label: row.label,
//                     comment: row.comment,
//                     color: row.color
//                 });
//                 }
//             }
//         });

//         // console.log(`Fetched timelines with details successfully. ${Array.from(timelinesMap.values())}`);

      

//         return timelinesMap;
//     } catch (error) {
//         console.error('Error fetching timelines with details:', error);
//         throw error;
//     }
// }



// async function createTimeline(id ,name, room_id, cues) {
//     console.log('Creating timeline with data');
//     const query = 'INSERT INTO tracks (id, room_id , name) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),?)';
//     const cue_query = 'INSERT INTO cues (label, comment, color, track_id, start_time, duration) VALUES (?, ?, ?, UUID_TO_BIN(?), ?, ?)';
//     try {

//         await db.query('START TRANSACTION');

//         await db.query(query, [id, room_id, name]);

//         for (let i = 0; i < cues.length; i++) {
//             const cue = cues[i];
//              await db.query(cue_query, [cue.label, cue.comment, cue.color, id, cue.startTime, cue.duration]);
//         }

//         await db.query('COMMIT');
        

//         return { id : id, name : name, room_id : room_id, cues : cues };

//     } catch (err) {
//         await db.query('ROLLBACK');
        
//         console.error('Error creating timeline:', err);
//         throw err;
//     }
// }

// async function updateTimeline(id ,name, room_id, cues) {
//     console.log('Updating timeline with data');
//     const delete_cues_query = 'DELETE FROM cues WHERE track_id = UUID_TO_BIN(?)';
//     const query = 'UPDATE tracks SET name = ?, room_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)';
//     const cue_query = 'INSERT INTO cues (id, label, comment, color, track_id, start_time, duration) VALUES (UUID_TO_BIN(?), ?, ?, ?, UUID_TO_BIN(?), ?, ?)';
//     try {

//         await db.query('START TRANSACTION');

//         // 큐 먼저 삭제
//         await db.query(delete_cues_query, [id]);

//         // 트랙 업데이트
//         await db.query(query, [name, room_id, id]);

//         // 새로운 큐 삽입
//         for (let i = 0; i < cues.length; i++) {
//             const cue = cues[i];
//              await db.query(cue_query, [cue.id, cue.label, cue.comment, cue.color, id, cue.startTime, cue.duration]);
//         }

//         await db.query('COMMIT');
       

//         return { id : id, name : name, room_id : room_id, cues : cues  };

//     } catch (err) {
//         await db.query('ROLLBACK');
        
//         console.error('Error updating timeline:', err);
//         throw err;
//     }
// }


// async function deleteTimeline(id) {
//     const query = 'DELETE t,c FROM tracks t LEFT JOIN cues c ON t.id = c.track_id WHERE t.id = UUID_TO_BIN(?)'; 
//     await db.query(query, [id]);
//     return { id };
// }

// module.exports = {
//     getTimelinesAll,
//     getTimelinesByProjectId,
//     getTimelinesByUser,
//     createTimeline,
//     updateTimeline,
//     deleteTimeline,
// };

