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
const correction = /^(?:(?:perdon|disculpa|corrijo|correccion|rectifico|me equivoque|quise decir|en realidad|mas bien)\b|no\s*[,.:;])/u;
const aside = /^(?:gracias|ok|vale|entendido|listo)(?:[.!?…]+)?$/iu;
const factGroups = {
  gusto: /\b(?:gustos?|preferencias?|favorit[oa]s?)\b/u,
  persona: /\b(?:personas?|pareja|amistades|amig[oa]s?|soci[oa]s?|familia)\b/u,
  proyecto: /\b(?:proyectos?|negocios?|empresas?)\b/u,
  otro: /$^/u,
};
const notesSchema = `CREATE TABLE IF NOT EXISTS social_notes (
  turn_id INTEGER PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
  source_turn_id INTEGER REFERENCES turns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('story', 'joke', 'moment')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 320),
  followed_at INTEGER,
  follow_after INTEGER,
  outcome_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL,
  UNIQUE (kind, text)
) STRICT;`;

function fold(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function factKey(label) {
  return fold(label).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

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

function matchSocialNote(notes, prompt, requireAllWords = false) {
  const requested = new Set(socialWords(prompt));
  if (!requested.size) return;
  const matches = notes.map((note) => ({
    note, score: socialWords(note.text).filter((word) => requested.has(word)).length,
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (best && best.score !== matches[1]?.score && (!requireAllWords || best.score === requested.size)) return best.note;
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
      ${notesSchema}
      CREATE INDEX IF NOT EXISTS social_source ON social_notes(source_turn_id);
      CREATE TABLE IF NOT EXISTS personal_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL CHECK (category IN ('gusto', 'persona', 'proyecto', 'otro')),
        label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0, 1)),
        UNIQUE (category, normalized_label)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS pending_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id INTEGER NOT NULL UNIQUE REFERENCES turns(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('note', 'reminder')),
        text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
        due_at INTEGER,
        announced_at INTEGER,
        completed_at INTEGER,
        CHECK ((kind = 'note' AND due_at IS NULL) OR (kind = 'reminder' AND due_at IS NOT NULL))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS pending_alarm ON pending_items(due_at) WHERE announced_at IS NULL AND completed_at IS NULL;
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
    if (!db.prepare('PRAGMA table_info(social_notes)').all().some(({ name }) => name === 'follow_after')) {
      db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE social_notes RENAME TO social_notes_previous;
        ${notesSchema}
        INSERT INTO social_notes(turn_id, source_turn_id, kind, text, followed_at)
          SELECT turn_id, source_turn_id, kind, text, followed_at FROM social_notes_previous;
        DROP TABLE social_notes_previous;
        CREATE INDEX social_source ON social_notes(source_turn_id);
        COMMIT;
      `);
    }
    if (!db.prepare('PRAGMA table_info(personal_facts)').all().some(({ name }) => name === 'automatic')) {
      db.exec('ALTER TABLE personal_facts ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0, 1))');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS learned_fact_values (
        fact_id INTEGER NOT NULL REFERENCES personal_facts(id) ON DELETE CASCADE,
        turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (fact_id, turn_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS learned_fact_turn ON learned_fact_values(turn_id);
      CREATE TRIGGER IF NOT EXISTS remove_empty_learned_fact AFTER DELETE ON learned_fact_values BEGIN
        DELETE FROM personal_facts WHERE id = old.fact_id AND automatic = 1
          AND NOT EXISTS (SELECT 1 FROM learned_fact_values WHERE fact_id = old.fact_id);
      END;
      CREATE TRIGGER IF NOT EXISTS keep_manual_fact AFTER UPDATE OF automatic ON personal_facts
      WHEN old.automatic = 1 AND new.automatic = 0 BEGIN
        DELETE FROM learned_fact_values WHERE fact_id = new.id;
      END;
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const insert = db.prepare('INSERT INTO turns(question, answer, tone, saved_at) VALUES(?, ?, ?, ?)');
  const latest = db.prepare('SELECT * FROM turns WHERE id NOT IN (SELECT turn_id FROM interrupted_turns) ORDER BY id DESC LIMIT 8');
  const olderMatches = db.prepare(`
    SELECT turns.* FROM turn_search JOIN turns ON turns.id = turn_search.rowid
    WHERE turn_search MATCH ? AND turns.id < ? AND turns.id NOT IN (SELECT turn_id FROM interrupted_turns)
    ORDER BY bm25(turn_search, 4.0, 1.0), turns.id DESC LIMIT 3
  `);
  const page = db.prepare(`
    SELECT turns.*, social_notes.kind, social_notes.text AS note_text, outcome.question AS note_outcome,
      turns.id IN (SELECT turn_id FROM interrupted_turns) AS interrupted FROM turns
    LEFT JOIN social_notes ON social_notes.turn_id = turns.id
    LEFT JOIN turns AS outcome ON outcome.id = social_notes.outcome_turn_id
    WHERE turns.id < ? AND (? IS NULL OR social_notes.kind = ?)
    ORDER BY turns.id DESC LIMIT ?
  `);
  const searchPage = db.prepare(`
    WITH matches AS (SELECT rowid FROM turn_search WHERE turn_search MATCH ?)
    SELECT turns.*, social_notes.kind, social_notes.text AS note_text, outcome.question AS note_outcome,
      turns.id IN (SELECT turn_id FROM interrupted_turns) AS interrupted
    FROM turns
    LEFT JOIN social_notes ON social_notes.turn_id = turns.id
    LEFT JOIN turns AS outcome ON outcome.id = social_notes.outcome_turn_id
    WHERE (turns.id IN matches OR social_notes.source_turn_id IN matches OR social_notes.outcome_turn_id IN matches)
      AND turns.id < ? AND (? IS NULL OR social_notes.kind = ?)
    ORDER BY turns.id DESC LIMIT ?
  `);
  const afterMatch = db.prepare('SELECT id, question, answer, saved_at FROM turns WHERE id > ? AND id < ? ORDER BY id LIMIT 4');
  const isInterrupted = db.prepare('SELECT 1 FROM interrupted_turns WHERE turn_id = ?');
  const remove = db.prepare('DELETE FROM turns WHERE id = ?');
  const clear = db.prepare('DELETE FROM turns');
  const last = db.prepare('SELECT id, question, answer FROM turns WHERE id NOT IN (SELECT turn_id FROM interrupted_turns) ORDER BY id DESC LIMIT 1');
  const interrupt = db.prepare('INSERT OR IGNORE INTO interrupted_turns SELECT id FROM turns WHERE id = ? AND id = (SELECT MAX(id) FROM turns)');
  const addNote = db.prepare(`
    INSERT INTO social_notes(turn_id, source_turn_id, kind, text, follow_after) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(kind, text) DO NOTHING
  `);
  const removeNote = db.prepare('DELETE FROM social_notes WHERE turn_id = ?');
  const socialList = db.prepare(`
    SELECT social_notes.turn_id, kind, text, follow_after AS followAfter, outcome.question AS outcome FROM social_notes
    LEFT JOIN turns AS outcome ON outcome.id = social_notes.outcome_turn_id
    WHERE kind = ? ORDER BY social_notes.turn_id DESC LIMIT ?
  `);
  const due = db.prepare(`
    SELECT social_notes.turn_id, kind, text FROM social_notes JOIN turns ON turns.id = social_notes.turn_id
    WHERE saved_at >= ? AND followed_at IS NULL AND (
      (kind = 'story' AND saved_at <= ?) OR (? AND kind = 'moment' AND follow_after <= ?)
    )
      AND NOT EXISTS (SELECT 1 FROM social_notes WHERE followed_at > ?)
    ORDER BY saved_at DESC, turns.id DESC LIMIT 1
  `);
  const followed = db.prepare('UPDATE social_notes SET followed_at = ? WHERE turn_id = ?');
  const resolveMoment = db.prepare("UPDATE social_notes SET outcome_turn_id = ?, followed_at = ? WHERE kind = 'moment' AND turn_id = ?");
  const getStory = db.prepare("SELECT turn_id, kind, text FROM social_notes WHERE kind IN ('story', 'moment') AND turn_id = ?");
  const newestStory = db.prepare("SELECT turn_id, kind, text FROM social_notes WHERE kind = 'story' ORDER BY turn_id DESC LIMIT 1");
  const readTurn = db.prepare('SELECT question, answer, tone, saved_at FROM turns WHERE id = ?');
  const readFacts = db.prepare(`
    SELECT fact.id, fact.category, fact.label, fact.automatic,
      coalesce(learned.value, fact.value) AS value, coalesce(learned.updated_at, fact.updated_at) AS updated_at
    FROM personal_facts AS fact LEFT JOIN learned_fact_values AS learned ON learned.fact_id = fact.id
      AND learned.turn_id = (SELECT max(turn_id) FROM learned_fact_values WHERE fact_id = fact.id)
    WHERE fact.id < ? ORDER BY fact.id DESC
  `);
  const addFact = db.prepare('INSERT INTO personal_facts(category, label, normalized_label, value, updated_at, automatic) VALUES(?, ?, ?, ?, ?, ?)');
  const editFact = db.prepare('UPDATE personal_facts SET category = ?, label = ?, normalized_label = ?, value = ?, updated_at = ?, automatic = 0 WHERE id = ?');
  const duplicateFact = db.prepare('SELECT id, automatic FROM personal_facts WHERE category = ? AND normalized_label = ?');
  const addLearned = db.prepare('INSERT OR IGNORE INTO learned_fact_values(fact_id, turn_id, value, updated_at) VALUES(?, ?, ?, ?)');
  const hasNote = db.prepare('SELECT 1 FROM social_notes WHERE turn_id = ?');
  const addPending = db.prepare('INSERT INTO pending_items(turn_id, kind, text, due_at) VALUES(?, ?, ?, ?)');
  const readPending = db.prepare(`SELECT id, kind, text, due_at AS dueAt FROM pending_items
    WHERE completed_at IS NULL ORDER BY due_at IS NULL, due_at, id`);
  const duePending = db.prepare(`SELECT id, text, due_at AS dueAt FROM pending_items
    WHERE completed_at IS NULL AND announced_at IS NULL AND due_at <= ? ORDER BY due_at, id`);
  const firstPending = db.prepare('SELECT min(due_at) AS dueAt FROM pending_items WHERE completed_at IS NULL AND announced_at IS NULL');
  const announcePending = db.prepare('UPDATE pending_items SET announced_at = ? WHERE id = ? AND announced_at IS NULL AND completed_at IS NULL');
  const closePending = db.prepare('UPDATE pending_items SET completed_at = ? WHERE id = ? AND completed_at IS NULL');
  const removeFact = db.prepare('DELETE FROM personal_facts WHERE id = ?');
  const clearFacts = db.prepare('DELETE FROM personal_facts');

  function saveFact(id, input) {
    const category = input?.category;
    const label = typeof input?.label === 'string' ? input.label.trim() : '';
    const value = typeof input?.value === 'string' ? input.value.trim() : '';
    if (typeof category !== 'string' || !Object.hasOwn(factGroups, category) ||
        !label || label.length > 80 || !value || value.length > 500) {
      throw new Error('Elige una categoría y escribe un tema de hasta 80 caracteres y un dato de hasta 500.');
    }
    const key = factKey(label);
    if (!key) throw new Error('Escribe un tema con letras o números.');
    const duplicate = duplicateFact.get(category, key);
    if (duplicate && duplicate.id !== id) throw new Error('Ya hay un dato con ese tema en esta categoría. Puedes editarlo.');
    if (id == null) return Number(addFact.run(category, label, key, value, Date.now(), 0).lastInsertRowid);
    if (!editFact.run(category, label, key, value, Date.now(), id).changes) throw new Error('Ese dato ya no está en la memoria.');
    return id;
  }

  function storeLearnedFact(turnId, { category, label, value }, now) {
    const key = factKey(label);
    if (!Object.hasOwn(factGroups, category) || !key || label.length > 80 || !value || value.length > 500) return;
    const current = duplicateFact.get(category, key);
    if (current && !current.automatic) return;
    const id = current?.id ?? Number(addFact.run(category, label, key, '', now, 1).lastInsertRowid);
    addLearned.run(id, turnId, value, now);
  }

  function learnFromTurn(id, { facts, add }) {
    if (!facts?.length && !add) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      const turn = readTurn.get(id);
      if (turn) {
        for (const fact of facts ?? []) storeLearnedFact(id, fact, turn.saved_at);
        if (add && !hasNote.get(id)) addNote.run(id, null, add.kind, add.text, add.followAfter ?? null);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function announceReminders(ids, time) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of ids) announcePending.run(time, id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function facts(query = '', before = Number.MAX_SAFE_INTEGER) {
    const requested = terms(fold(query));
    const matches = readFacts.all(before ?? Number.MAX_SAFE_INTEGER).filter(({ category, label, value }) => {
      const searchable = fold([category, label, value].join(' '));
      return requested.every((word) => searchable.includes(word));
    });
    const entries = matches.slice(0, pageSize);
    return { entries, next: matches.length > pageSize ? entries.at(-1).id : null };
  }

  function factContext(prompt) {
    const normalized = fold(prompt);
    const keywords = terms(normalized).filter((word) => word.length >= 3 && !common.has(word));
    const overview = /\b(?:sabes|recuerdas|conoces) (?:algo )?(?:de|sobre) mi\b/u.test(normalized);
    return readFacts.all(Number.MAX_SAFE_INTEGER).map((fact) => {
      const label = new Set(terms(fold(fact.label)));
      const value = new Set(terms(fold(fact.value)));
      const score = keywords.reduce((total, word) => total + (label.has(word) ? 5 : value.has(word) ? 1 : 0), 0);
      return { fact, score: score + (factGroups[fact.category].test(normalized) ? 3 : 0) };
    }).filter(({ score }) => score || overview).sort((a, b) => b.score - a.score).slice(0, 4)
      .map(({ fact }) => ({ categoria: fact.category, tema: fact.label, dato: clip(fact.value, 280), editedAt: fact.updated_at }));
  }

  function findFact(label) {
    const key = factKey(label);
    const matches = readFacts.all(Number.MAX_SAFE_INTEGER).filter((fact) => factKey(fact.label) === key);
    return matches.length === 1 ? matches[0] : undefined;
  }

  function takeTurn(id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const turn = readTurn.get(id);
      if (turn) remove.run(id);
      db.exec('COMMIT');
      return turn;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function clearMemory() {
    db.exec('BEGIN IMMEDIATE');
    try {
      clear.run();
      clearFacts.run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function nextStory(now = Date.now(), includeMoments = false) {
    return due.get(now - 30 * day, now - day, Number(includeMoments), now, now - day);
  }

  function followStory(id, now = Date.now()) {
    const story = nextStory(now, true);
    if (story?.turn_id !== id) return;
    followed.run(now, id);
    return story;
  }

  function context(prompt) {
    const recent = [];
    let budget = 3900;
    for (const row of latest.all()) {
      const newest = recent.length < 2;
      const question = clip(row.question, newest ? 1200 : 570);
      const answer = clip(row.answer, newest ? 750 : 420);
      const cost = question.length + answer.length;
      if (cost > budget) break;
      recent.push({ ...row, question, answer });
      budget -= cost;
    }
    const keywords = terms(prompt).filter((term) => {
      const plain = term.normalize('NFD').replace(/\p{M}/gu, '');
      return (plain.length >= 3 && !common.has(plain)) || /^\d{2,}$/.test(plain);
    }).slice(0, 12);
    const boundary = recent.at(-1)?.id ?? Number.MAX_SAFE_INTEGER;
    const older = keywords.length
      ? olderMatches.all(keywords.map((term) => `"${term}"`).join(' OR '), boundary) : [];
    const relevant = new Map();
    let olderBudget = 2300;
    for (const row of older) {
      const linked = [row];
      let id = row.id;
      for (const next of afterMatch.all(row.id, boundary)) {
        if (next.id !== id + 1 || isInterrupted.get(next.id)) break;
        id = next.id;
        if (aside.test(next.question.trim())) continue;
        const plain = next.question.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
        if (!correction.test(plain)) break;
        linked.push(next);
      }
      const entries = linked.filter((entry) => !relevant.has(entry.id)).map((entry) => [entry.id, {
        usuario: clip(entry.question, 350), asistente: clip(entry.answer, 180), savedAt: entry.saved_at,
      }]);
      const cost = entries.reduce((sum, [, entry]) => sum + entry.usuario.length + entry.asistente.length, 0);
      if (cost > olderBudget) continue;
      olderBudget -= cost;
      for (const [key, entry] of entries) relevant.set(key, entry);
    }
    return {
      recent: recent.reverse(),
      relevant: [...relevant].sort(([a], [b]) => a - b).map(([, entry]) => entry),
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
    return matchSocialNote(socialList.all(kind, -1), prompt, requireAllWords);
  }

  function save(question, answer, tone, change) {
    const now = Date.now();
    if (!change) return Number(insert.run(question, answer, tone, now).lastInsertRowid);
    db.exec('BEGIN');
    try {
      const id = Number(insert.run(question, answer, tone, now).lastInsertRowid);
      for (const fact of change.learnedFacts ?? []) storeLearnedFact(id, fact, now);
      if (change.pending) addPending.run(id, change.pending.kind, change.pending.text, change.pending.dueAt ?? null);
      if (change.add) addNote.run(id, change.add.source ?? null, change.add.kind, change.add.text, change.add.followAfter ?? null);
      if (change.close) removeNote.run(change.close);
      if (change.followUp) followed.run(now, change.followUp);
      if (change.outcome) resolveMoment.run(id, now, change.outcome);
      db.exec('COMMIT');
      return id;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    context, list, save, matchNote,
    facts, saveFact, factContext, findFact, takeTurn, learnFromTurn,
    pendingItems: () => readPending.all(),
    dueReminders: (time) => duePending.all(time),
    nextReminder: () => firstPending.get().dueAt,
    announceReminders,
    completePending: (id, time = Date.now()) => closePending.run(time, id).changes > 0,
    removeFact: (id) => removeFact.run(id),
    last: () => last.get(),
    socialList: (kind, limit) => socialList.all(kind, limit),
    removeNote: (id) => removeNote.run(id),
    nextStory, followStory,
    story: (id) => getStory.get(id),
    newestStory: () => newestStory.get(),
    remove: (id) => remove.run(id),
    interrupt: (id) => interrupt.run(id),
    clear: clearMemory,
    close: () => db.close(),
  };
}

module.exports = { createConversationMemory, matchSocialNote };
