const { DatabaseSync } = require('node:sqlite');

const pageSize = 10;
const common = new Set([
  'algo', 'antes', 'aqui', 'cual', 'cuando', 'dije', 'dijiste', 'dime', 'donde', 'ella', 'entonces',
  'era', 'eres', 'esa', 'ese', 'eso', 'esta', 'estaba', 'este', 'esto', 'habia', 'hace', 'hacia',
  'hasta', 'llama', 'llamaba', 'mas', 'mismo', 'mucho', 'para', 'pero', 'por', 'porque', 'puedes',
  'que', 'quien', 'recuerda', 'recuerdas', 'recuerdo', 'sobre', 'soy', 'tambien', 'tenia', 'tiene',
  'tienes', 'todo', 'una', 'uno', 'vamos', 'vez', 'como', 'con', 'del', 'los', 'las', 'mis', 'tus',
]);

function terms(text) {
  return [...new Set(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu))];
}

function clip(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit).trimEnd() + '…';
}

function createConversationMemory(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA secure_delete = ON;
      BEGIN;
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        tone TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      ) STRICT;
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
  const latest = db.prepare('SELECT * FROM turns ORDER BY id DESC LIMIT 5');
  const olderMatches = db.prepare(`
    SELECT turns.* FROM turn_search JOIN turns ON turns.id = turn_search.rowid
    WHERE turn_search MATCH ? AND turns.id < ?
    ORDER BY bm25(turn_search, 4.0, 1.0), turns.id DESC LIMIT 3
  `);
  const page = db.prepare('SELECT * FROM turns WHERE id < ? ORDER BY id DESC LIMIT ?');
  const searchPage = db.prepare(`
    SELECT turns.* FROM turn_search JOIN turns ON turns.id = turn_search.rowid
    WHERE turn_search MATCH ? AND turns.id < ? ORDER BY turns.id DESC LIMIT ?
  `);
  const remove = db.prepare('DELETE FROM turns WHERE id = ?');
  const clear = db.prepare('DELETE FROM turns');

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

  function list(query, before) {
    const boundary = before ?? Number.MAX_SAFE_INTEGER;
    const keywords = terms(query).slice(0, 12);
    const rows = !query ? page.all(boundary, pageSize + 1)
      : keywords.length ? searchPage.all(keywords.map((term) => `"${term}"*`).join(' AND '), boundary, pageSize + 1)
        : [];
    const entries = rows.slice(0, pageSize);
    return { entries, next: rows.length > pageSize ? entries.at(-1).id : null };
  }

  return {
    context, list,
    save: (question, answer, tone) => Number(insert.run(question, answer, tone, Date.now()).lastInsertRowid),
    remove: (id) => remove.run(id),
    clear: () => clear.run(),
    close: () => db.close(),
  };
}

module.exports = { createConversationMemory };
