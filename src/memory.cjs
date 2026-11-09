const { DatabaseSync } = require('node:sqlite');

const pageSize = 10;
const day = 24 * 60 * 60 * 1000;
const common = new Set([
  'algo', 'antes', 'aqui', 'cual', 'cuando', 'dije', 'dijiste', 'dime', 'donde', 'ella', 'entonces',
  'era', 'eres', 'esa', 'ese', 'eso', 'esta', 'estaba', 'este', 'esto', 'habia', 'hace', 'hacia',
  'hasta', 'llama', 'llamaba', 'mas', 'mismo', 'mucho', 'para', 'pero', 'por', 'porque', 'puedes',
  'que', 'quien', 'recuerda', 'recuerdas', 'recuerdo', 'sobre', 'soy', 'tambien', 'tenia', 'tiene',
  'tienes', 'todo', 'una', 'uno', 'vamos', 'vez', 'como', 'con', 'del', 'los', 'las', 'mis', 'tus',
]);
const socialCommon = new Set([
  'aburrido', 'acuerdo', 'chisme', 'chiste', 'contar', 'cuento', 'guarda', 'historia',
  'interno', 'luego', 'mismo', 'pendiente', 'quedo', 'termino', 'todavia', 'volvio',
]);

function terms(text) {
  return [...new Set(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu))];
}

function clip(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit).trimEnd() + '…';
}

function socialWords(text) {
  return terms(text.normalize('NFD').replace(/\p{M}/gu, ''))
    .filter((word) => word.length >= 4 && !common.has(word) && !socialCommon.has(word));
}

function createConversationMemory(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA secure_delete = ON;
      PRAGMA foreign_keys = ON;
      BEGIN;
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        tone TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS interrupted_turns (
        turn_id INTEGER PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE
      ) STRICT;
      CREATE TABLE IF NOT EXISTS social_notes (
        turn_id INTEGER PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
        source_turn_id INTEGER REFERENCES turns(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('story', 'joke')),
        text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 320),
        followed_at INTEGER,
        UNIQUE (kind, text)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS social_source ON social_notes(source_turn_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS turn_search USING fts5(
        question, answer, content='turns', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
      );
      INSERT INTO turn_search(turn_search, rank) VALUES('secure-delete', 1);
      CREATE TRIGGER IF NOT EXISTS turns_search_insert AFTER INSERT ON turns BEGIN
        INSERT INTO turn_search(rowid, question, answer) VALUES(new.id, new.question, new.answer);
      END;
      CREATE TRIGGER IF NOT EXISTS turns_search_delete AFTER DELETE ON turns BEGIN
        INSERT INTO turn_search(turn_search, rowid, question, answer)
        VALUES('delete', old.id, old.question, old.answer);
      END;
      COMMIT;
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const insert = db.prepare('INSERT INTO turns(question, answer, tone, saved_at) VALUES(?, ?, ?, ?)');
  const latest = db.prepare('SELECT * FROM turns WHERE id NOT IN (SELECT turn_id FROM interrupted_turns) ORDER BY id DESC LIMIT 5');
  const olderMatches = db.prepare(`
    SELECT turns.* FROM turn_search JOIN turns ON turns.id = turn_search.rowid
    WHERE turn_search MATCH ? AND turns.id < ? AND turns.id NOT IN (SELECT turn_id FROM interrupted_turns)
    ORDER BY bm25(turn_search, 4.0, 1.0), turns.id DESC LIMIT 3
  `);
  const page = db.prepare(`
    SELECT turns.*, social_notes.kind, social_notes.text AS note_text,
      turns.id IN (SELECT turn_id FROM interrupted_turns) AS interrupted FROM turns
    LEFT JOIN social_notes ON social_notes.turn_id = turns.id
    WHERE turns.id < ? AND (? IS NULL OR social_notes.kind = ?)
    ORDER BY turns.id DESC LIMIT ?
  `);
  const searchPage = db.prepare(`
    WITH matches AS (SELECT rowid FROM turn_search WHERE turn_search MATCH ?)
    SELECT turns.*, social_notes.kind, social_notes.text AS note_text,
      turns.id IN (SELECT turn_id FROM interrupted_turns) AS interrupted
    FROM turns
    LEFT JOIN social_notes ON social_notes.turn_id = turns.id
    WHERE (turns.id IN matches OR social_notes.source_turn_id IN matches)
      AND turns.id < ? AND (? IS NULL OR social_notes.kind = ?)
    ORDER BY turns.id DESC LIMIT ?
  `);
  const remove = db.prepare('DELETE FROM turns WHERE id = ?');
  const clear = db.prepare('DELETE FROM turns');
  const last = db.prepare('SELECT id, question, answer FROM turns WHERE id NOT IN (SELECT turn_id FROM interrupted_turns) ORDER BY id DESC LIMIT 1');
  const interrupt = db.prepare('INSERT OR IGNORE INTO interrupted_turns SELECT id FROM turns WHERE id = ? AND id = (SELECT MAX(id) FROM turns)');
  const addNote = db.prepare(`
    INSERT INTO social_notes(turn_id, source_turn_id, kind, text) VALUES(?, ?, ?, ?)
    ON CONFLICT(kind, text) DO NOTHING
  `);
  const removeNote = db.prepare('DELETE FROM social_notes WHERE turn_id = ?');
  const socialList = db.prepare('SELECT turn_id, kind, text FROM social_notes WHERE kind = ? ORDER BY turn_id DESC LIMIT ?');
  const due = db.prepare(`
    SELECT social_notes.turn_id, social_notes.text FROM social_notes JOIN turns ON turns.id = social_notes.turn_id
    WHERE kind = 'story' AND followed_at IS NULL AND saved_at BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM social_notes WHERE followed_at > ?)
    ORDER BY saved_at DESC LIMIT 1
  `);
  const followed = db.prepare('UPDATE social_notes SET followed_at = ? WHERE turn_id = ?');

  function context(prompt) {
    const recent = [];
    let budget = 2600;
    for (const row of latest.all()) {
      const answer = clip(row.answer, 1100);
      const cost = row.question.length + answer.length;
      if (cost > budget) break;
      recent.push({ ...row, answer });
      budget -= cost;
    }
    const keywords = terms(prompt).filter((term) => {
      const plain = term.normalize('NFD').replace(/\p{M}/gu, '');
      return (plain.length >= 3 && !common.has(plain)) || /^\d{2,}$/.test(plain);
    }).slice(0, 12);
    const older = keywords.length
      ? olderMatches.all(keywords.map((term) => `"${term}"`).join(' OR '),
        recent.at(-1)?.id ?? Number.MAX_SAFE_INTEGER)
      : [];
    return {
      recent: recent.reverse(),
      relevant: older.sort((a, b) => a.id - b.id).map((row) => ({
        usuario: clip(row.question, 450), asistente: clip(row.answer, 230),
      })),
    };
  }

  function list(query, before, kind = null) {
    const boundary = before ?? Number.MAX_SAFE_INTEGER;
    const keywords = terms(query).slice(0, 12);
    const rows = !query ? page.all(boundary, kind, kind, pageSize + 1)
      : keywords.length ? searchPage.all(keywords.map((term) => `"${term}"*`).join(' AND '), boundary, kind, kind, pageSize + 1)
        : [];
    const entries = rows.slice(0, pageSize);
    return { entries, next: rows.length > pageSize ? entries.at(-1).id : null };
  }

  function matchNote(kind, prompt, requireAllWords = false) {
    const requested = new Set(socialWords(prompt));
    if (!requested.size) return;
    const matches = socialList.all(kind, -1).map((note) => ({
      note, score: socialWords(note.text).filter((word) => requested.has(word)).length,
    })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (best && best.score !== matches[1]?.score && (!requireAllWords || best.score === requested.size)) return best.note;
  }

  function save(question, answer, tone, change) {
    const now = Date.now();
    if (!change) return Number(insert.run(question, answer, tone, now).lastInsertRowid);
    db.exec('BEGIN');
    try {
      const id = Number(insert.run(question, answer, tone, now).lastInsertRowid);
      if (change.add) addNote.run(id, change.add.source ?? null, change.add.kind, change.add.text);
      if (change.close) removeNote.run(change.close);
      if (change.followUp) followed.run(now, change.followUp);
      db.exec('COMMIT');
      return id;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    context, list, save, matchNote,
    last: () => last.get(),
    socialList: (kind, limit) => socialList.all(kind, limit),
    removeNote: (id) => removeNote.run(id),
    nextStory: (now = Date.now()) => due.get(now - 30 * day, now - day, now - day),
    remove: (id) => remove.run(id),
    interrupt: (id) => interrupt.run(id),
    clear: () => clear.run(),
    close: () => db.close(),
  };
}

module.exports = { createConversationMemory };
