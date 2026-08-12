"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");
const child_process = require("child_process");
const os = require("os");
const http = require("http");
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    isProductive INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tagId INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    startTime TEXT NOT NULL,
    endTime TEXT,
    studyNodeId INTEGER
  );

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (1, 'Idle', '#6b7280', 0);

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (2, 'Work', '#3b82f6', 1);

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (3, 'Break', '#f59e0b', 0);
  CREATE TABLE IF NOT EXISTS day_configs (
    date TEXT PRIMARY KEY,
    isWorkDay INTEGER NOT NULL DEFAULT 0
  );

  -- ── RickOS: Organização ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    githubRepoUrl TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    archived INTEGER NOT NULL DEFAULT 0,
    claudeCommand TEXT,
    localPath TEXT,
    stage TEXT NOT NULL DEFAULT 'ideia',   -- ideia|validacao|mvp|lancado|monetizando|morto|trabalho
    businessModel TEXT,
    pricing TEXT,
    audience TEXT
  );

  CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    targetDate TEXT,
    doneAt TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',   -- inbox | todo | doing | done
    priority INTEGER NOT NULL DEFAULT 0,
    dueDate TEXT,
    projectId INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual',  -- manual | quick-capture | github
    aiGenerated INTEGER NOT NULL DEFAULT 0,
    recurrence TEXT,                        -- JSON: { type, n?, day? } | null
    type TEXT NOT NULL DEFAULT 'projeto',   -- projeto | compra | urgente | lembrete
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'daily',
    target INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS habit_entries (
    habitId INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completedAt TEXT,
    PRIMARY KEY (habitId, date)
  );

  -- ── RickOS: Finanças ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    balance REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',   -- income | expense
    color TEXT NOT NULL DEFAULT '#6366f1'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accountId INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    type TEXT NOT NULL DEFAULT 'expense',   -- income | expense
    description TEXT,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL'
  );

  -- Monthly value snapshot per investment (YYYY-MM). One row per (investmentId, month).
  CREATE TABLE IF NOT EXISTS investment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investmentId INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (1, 'Salário', 'income', '#22c55e');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (2, 'Alimentação', 'expense', '#f59e0b');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (3, 'Transporte', 'expense', '#3b82f6');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (4, 'Moradia', 'expense', '#8b5cf6');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (5, 'Lazer', 'expense', '#ec4899');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (6, 'Outros', 'expense', '#6b7280');

  -- ── RickOS: Viagens ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT,
    destination TEXT NOT NULL,
    startDate TEXT,
    endDate TEXT,
    budget REAL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'planned'
  );

  CREATE TABLE IF NOT EXISTS flight_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tripId INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    origin TEXT,
    destination TEXT,
    price REAL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    lastChecked TEXT
  );

  CREATE TABLE IF NOT EXISTS trip_documents (
    tripId INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tripId, item)
  );

  -- ── RickOS: Settings & integrações ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS github_issues (
    id INTEGER PRIMARY KEY,          -- GitHub's global issue id (negative for local-only)
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,             -- open | closed
    repo TEXT NOT NULL,              -- owner/name
    url TEXT,                        -- NULL until it exists on GitHub
    labels TEXT,                     -- JSON array of label names
    milestone TEXT,
    updatedAt TEXT,
    local INTEGER NOT NULL DEFAULT 0, -- 1 = created in-app, survives sync
    body TEXT                         -- description (used when creating on GitHub)
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    startTime TEXT NOT NULL,         -- ISO
    endTime TEXT,
    location TEXT,
    source TEXT NOT NULL DEFAULT 'manual'  -- manual | google
  );

  -- ── RickOS: IA (skills, agentes, execuções) ──────────────────────────
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL DEFAULT '',
    isFavorite INTEGER NOT NULL DEFAULT 0,
    usageCount INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    role TEXT,
    systemPrompt TEXT NOT NULL DEFAULT '',
    defaultSkillIds TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    isFavorite INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompt_executions (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    agentId TEXT,
    skillIds TEXT NOT NULL DEFAULT '[]',
    userPrompt TEXT NOT NULL DEFAULT '',
    finalPrompt TEXT NOT NULL DEFAULT '',
    response TEXT
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    lastOpenedAt TEXT,
    createdAt TEXT NOT NULL
  );

  -- ── Estudos (Learning OS) ──
  CREATE TABLE IF NOT EXISTS study_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'studying',  -- studying | planned | paused | completed
    targetDate TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6366f1',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    parentId INTEGER,                        -- self-ref; null = raiz
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',     -- todo | doing | done
    orderIndex INTEGER NOT NULL DEFAULT 0,
    estimatedHours REAL,
    completedAt TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    nodeId INTEGER REFERENCES study_nodes(id) ON DELETE CASCADE,  -- null = nota do tópico
    content TEXT NOT NULL DEFAULT '',
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    nodeId INTEGER REFERENCES study_nodes(id) ON DELETE SET NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    easeFactor REAL NOT NULL DEFAULT 2.5,
    intervalDays INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    nextReviewAt TEXT,
    lastReviewedAt TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    durationMs INTEGER,
    createdAt TEXT NOT NULL
  );

  -- Travel Stay Finder (busca de hospedagens)
  CREATE TABLE IF NOT EXISTS travel_stay_favorites (
    id TEXT PRIMARY KEY,
    tripId INTEGER,
    provider TEXT,
    listingUrl TEXT,
    title TEXT,
    pricePerNight REAL,
    currency TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS travel_stay_watches (
    id TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    filters TEXT NOT NULL DEFAULT '{}',
    currentPrice REAL NOT NULL DEFAULT 0,
    bestPrice REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL',
    lastCheckedAt TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS travel_stay_price_history (
    id TEXT PRIMARY KEY,
    watchId TEXT NOT NULL,
    checkedAt TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL'
  );
  CREATE TABLE IF NOT EXISTS travel_stay_search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filters TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  -- CRM pessoal (manutenção de relações importantes)
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,             -- cidade/país
    birthday TEXT,             -- MM-DD ou YYYY-MM-DD
    interests TEXT,
    context TEXT,              -- o que está acontecendo na vida dela
    lastContactAt TEXT,        -- ISO da última conversa
    nextFollowUp TEXT,         -- YYYY-MM-DD
    createdAt TEXT NOT NULL
  );

  -- Automações: motor de regras (condição → ação)
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,            -- idle_productive | budget_threshold | due_flashcards
    enabled INTEGER NOT NULL DEFAULT 1,
    params TEXT NOT NULL DEFAULT '{}',
    lastFiredAt TEXT,
    createdAt TEXT NOT NULL
  );

  -- Automações: agendador de agentes → Inbox
  CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    hour INTEGER NOT NULL DEFAULT 7,
    enabled INTEGER NOT NULL DEFAULT 1,
    lastRunAt TEXT,
    createdAt TEXT NOT NULL
  );

  -- Metas mensais (opcionalmente ligadas a um projeto ou tópico de estudo)
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,            -- YYYY-MM
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'free',  -- free | project | study
    refId INTEGER,                 -- projectId ou study_topicId conforme kind
    target REAL NOT NULL DEFAULT 1,
    current REAL NOT NULL DEFAULT 0,
    unit TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
`;
const SKILLS = [
  {
    id: "seed-skill-code-review",
    name: "Code Review",
    description: "Revisão de código focada em bugs e clareza.",
    category: "Engenharia",
    tags: ["código", "qualidade"],
    content: "Revise o código a seguir. Aponte bugs, riscos e melhorias de legibilidade, em ordem de severidade. Seja específico e sugira o diff quando fizer sentido."
  },
  {
    id: "seed-skill-refactor-ts",
    name: "Refatoração TypeScript",
    description: "Refatorar TS mantendo comportamento.",
    category: "Engenharia",
    tags: ["typescript", "refactor"],
    content: "Refatore o TypeScript a seguir para reduzir complexidade e melhorar tipos, sem mudar o comportamento. Explique cada mudança brevemente."
  },
  {
    id: "seed-skill-project-plan",
    name: "Planejamento de Projeto",
    description: "Quebrar um objetivo em plano acionável.",
    category: "Produto",
    tags: ["planejamento"],
    content: "Transforme o objetivo a seguir em um plano com marcos, tarefas priorizadas e riscos. Formate como checklist."
  },
  {
    id: "seed-skill-prompt-eng",
    name: "Prompt Engineering",
    description: "Melhorar um prompt de IA.",
    category: "IA",
    tags: ["prompt"],
    content: "Melhore o prompt a seguir: deixe objetivo, contexto e formato de saída explícitos. Retorne o prompt reescrito."
  },
  {
    id: "seed-skill-log-analysis",
    name: "Análise de Logs",
    description: "Encontrar a causa raiz em logs.",
    category: "DevOps",
    tags: ["logs", "debug"],
    content: "Analise os logs a seguir, identifique a causa raiz provável e proponha os próximos passos de diagnóstico."
  },
  {
    id: "seed-skill-k8s-diag",
    name: "Diagnóstico Kubernetes",
    description: "Diagnosticar problemas em clusters k8s.",
    category: "DevOps",
    tags: ["kubernetes"],
    content: "Dado o sintoma a seguir num cluster Kubernetes, liste hipóteses ordenadas por probabilidade e os comandos kubectl para verificar cada uma."
  }
];
const AGENTS = [
  {
    id: "seed-agent-backend",
    name: "Backend Engineer",
    description: "Engenheiro backend pragmático.",
    role: "Engenharia",
    systemPrompt: "Você é um engenheiro backend sênior. Priorize correção, simplicidade e testes.",
    defaultSkillIds: ["seed-skill-code-review", "seed-skill-refactor-ts"],
    tags: ["backend"]
  },
  {
    id: "seed-agent-devops",
    name: "DevOps Engineer",
    description: "Especialista em infraestrutura e observabilidade.",
    role: "DevOps",
    systemPrompt: "Você é um engenheiro DevOps. Pense em confiabilidade, logs e diagnóstico rápido.",
    defaultSkillIds: ["seed-skill-log-analysis", "seed-skill-k8s-diag"],
    tags: ["devops"]
  },
  {
    id: "seed-agent-product",
    name: "Product Strategist",
    description: "Estrategista de produto orientado a impacto.",
    role: "Produto",
    systemPrompt: "Você é um estrategista de produto. Foque em impacto, escopo e clareza.",
    defaultSkillIds: ["seed-skill-project-plan"],
    tags: ["produto"]
  },
  {
    id: "seed-agent-prompt",
    name: "Prompt Engineer",
    description: "Especialista em prompts de IA.",
    role: "IA",
    systemPrompt: "Você é um especialista em prompt engineering. Torne instruções claras e testáveis.",
    defaultSkillIds: ["seed-skill-prompt-eng"],
    tags: ["ia", "prompt"]
  }
];
function count(db2, table) {
  const res = db2.exec(`SELECT COUNT(*) FROM ${table}`);
  const v = res[0]?.values?.[0]?.[0];
  return typeof v === "number" ? v : 0;
}
function seedAiLibrary(db2) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (count(db2, "skills") === 0) {
    for (const s of SKILLS) {
      db2.run(
        `INSERT OR IGNORE INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [s.id, s.name, s.description, s.category, JSON.stringify(s.tags), s.content, now, now]
      );
    }
  }
  if (count(db2, "agents") === 0) {
    for (const a of AGENTS) {
      db2.run(
        `INSERT OR IGNORE INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [a.id, a.name, a.description, a.role, a.systemPrompt, JSON.stringify(a.defaultSkillIds), JSON.stringify(a.tags), now, now]
      );
    }
  }
}
let db = null;
let dbPath;
const MIGRATIONS = [
  {
    version: 1,
    label: "tasks.secondaryTagId",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;");
      } catch {
      }
    }
  },
  {
    version: 2,
    label: "projects.claudeCommand",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE projects ADD COLUMN claudeCommand TEXT;");
      } catch {
      }
    }
  },
  {
    version: 3,
    label: "github_issues.local + body",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE github_issues ADD COLUMN local INTEGER NOT NULL DEFAULT 0;");
      } catch {
      }
      try {
        db2.run("ALTER TABLE github_issues ADD COLUMN body TEXT;");
      } catch {
      }
    }
  },
  {
    version: 4,
    label: "investment_history + backfill current month",
    run: (db2) => {
      db2.run(`CREATE TABLE IF NOT EXISTS investment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        investmentId INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );`);
      try {
        const now = /* @__PURE__ */ new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        db2.run(
          `INSERT INTO investment_history (investmentId, month, amount)
           SELECT id, ?, amount FROM investments
           WHERE id NOT IN (SELECT investmentId FROM investment_history WHERE month = ?);`,
          [month, month]
        );
      } catch {
      }
    }
  },
  {
    version: 5,
    label: "links.tags",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE links ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';");
      } catch {
      }
    }
  },
  {
    version: 6,
    label: "todos.aiGenerated",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE todos ADD COLUMN aiGenerated INTEGER NOT NULL DEFAULT 0;");
      } catch {
      }
    }
  },
  {
    version: 7,
    label: "tasks.studyNodeId",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE tasks ADD COLUMN studyNodeId INTEGER;");
      } catch {
      }
    }
  },
  {
    version: 8,
    label: "habit_entries.completedAt",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE habit_entries ADD COLUMN completedAt TEXT;");
      } catch {
      }
    }
  },
  {
    version: 9,
    label: "todos.recurrence",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE todos ADD COLUMN recurrence TEXT;");
      } catch {
      }
    }
  },
  {
    version: 10,
    label: "links.lastOpenedAt",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE links ADD COLUMN lastOpenedAt TEXT;");
      } catch {
      }
    }
  },
  {
    version: 11,
    label: "projects.localPath",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE projects ADD COLUMN localPath TEXT;");
      } catch {
      }
    }
  },
  {
    version: 12,
    label: "projects business pipeline fields",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'trabalho';");
      } catch {
      }
      try {
        db2.run("ALTER TABLE projects ADD COLUMN businessModel TEXT;");
      } catch {
      }
      try {
        db2.run("ALTER TABLE projects ADD COLUMN pricing TEXT;");
      } catch {
      }
      try {
        db2.run("ALTER TABLE projects ADD COLUMN audience TEXT;");
      } catch {
      }
    }
  },
  {
    version: 13,
    label: "todos.type",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE todos ADD COLUMN type TEXT NOT NULL DEFAULT 'projeto';");
      } catch {
      }
    }
  }
];
function getUserVersion(database) {
  const res = database.exec("PRAGMA user_version");
  const v = res[0]?.values?.[0]?.[0];
  return typeof v === "number" ? v : 0;
}
function runMigrations(database) {
  const current = getUserVersion(database);
  const target = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
  if (current >= target) return;
  for (const m of MIGRATIONS) {
    if (m.version > current) m.run(database);
  }
  database.run(`PRAGMA user_version = ${target}`);
}
async function getDb() {
  if (db) return db;
  dbPath = path.join(electron.app.getPath("userData"), "timetracker.db");
  const sqlJsModulePath = require.resolve("sql.js");
  const wasmPath = path.join(path.dirname(sqlJsModulePath), "sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  });
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  runMigrations(db);
  seedAiLibrary(db);
  saveDb();
  return db;
}
function saveDb() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}
function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
const SNAP_KEEP = 3;
function snapshotsDir() {
  const dir = path.join(electron.app.getPath("userData"), "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function listSnapshots() {
  const dir = snapshotsDir();
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sqlite")).map((f) => {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    return { name: f, path: p, date: s.mtime.toISOString(), size: s.size };
  }).sort((a, b) => b.name.localeCompare(a.name));
}
function snapshotDailyIfNeeded() {
  if (!dbPath || !fs.existsSync(dbPath)) return;
  const now = /* @__PURE__ */ new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dir = snapshotsDir();
  const target = path.join(dir, `timetracker_${day}.sqlite`);
  try {
    if (!fs.existsSync(target)) {
      saveDb();
      fs.copyFileSync(dbPath, target);
    }
    const all = listSnapshots();
    for (const old of all.slice(SNAP_KEEP)) {
      try {
        fs.unlinkSync(old.path);
      } catch {
      }
    }
  } catch {
  }
}
function restoreSnapshot(snapPath) {
  if (!dbPath || !fs.existsSync(snapPath)) return false;
  closeDb();
  fs.copyFileSync(snapPath, dbPath);
  return true;
}
function getOne(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    stmt.free();
    return obj;
  }
  stmt.free();
  return null;
}
function getAll(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}
function run(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  stmt.run(params);
  stmt.free();
  saveDb();
}
function lastInsertId(db2) {
  const stmt = db2.prepare("SELECT last_insert_rowid() as id");
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return id;
}
async function getAllTags() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM tags ORDER BY id");
}
async function createTag(name, color, isProductive) {
  const db2 = await getDb();
  run(db2, "INSERT INTO tags (name, color, isProductive) VALUES (?, ?, ?)", [
    name,
    color,
    isProductive
  ]);
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM tags WHERE id = ?", [id]);
}
async function updateTag(id, name, color, isProductive) {
  const db2 = await getDb();
  run(db2, "UPDATE tags SET name = ?, color = ?, isProductive = ? WHERE id = ?", [
    name,
    color,
    isProductive,
    id
  ]);
  return getOne(db2, "SELECT * FROM tags WHERE id = ?", [id]);
}
async function deleteTag(id) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET tagId = 1 WHERE tagId = ?", [id]);
  run(db2, "DELETE FROM tags WHERE id = ?", [id]);
}
const TASK_WITH_TAG_SQL = `
  SELECT t.id, t.title, t.tagId, t.secondaryTagId, t.startTime, t.endTime, t.studyNodeId,
         tg.name as tagName, tg.color as tagColor, tg.isProductive as tagIsProductive,
         stg.name as secondaryTagName, stg.color as secondaryTagColor,
         sn.title as studyNodeTitle, st.id as studyTopicId, st.name as studyTopicName, st.color as studyTopicColor
  FROM tasks t
  LEFT JOIN tags tg ON t.tagId = tg.id
  LEFT JOIN tags stg ON t.secondaryTagId = stg.id
  LEFT JOIN study_nodes sn ON t.studyNodeId = sn.id
  LEFT JOIN study_topics st ON sn.topicId = st.id
`;
async function getTasksForRange(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
    `${TASK_WITH_TAG_SQL}
     WHERE t.startTime >= ? AND t.startTime < ?
     ORDER BY t.startTime ASC`,
    [startDate, endDate]
  );
}
async function getAllTasks() {
  const db2 = await getDb();
  return getAll(
    db2,
    `${TASK_WITH_TAG_SQL} ORDER BY t.startTime DESC`
  );
}
async function getActiveTask() {
  const db2 = await getDb();
  return getOne(
    db2,
    `${TASK_WITH_TAG_SQL}
     WHERE t.endTime IS NULL
     ORDER BY t.startTime DESC
     LIMIT 1`
  );
}
async function createTask(title, tagId, secondaryTagId, startTime, endTime = null, studyNodeId = null) {
  const db2 = await getDb();
  run(db2, "INSERT INTO tasks (title, tagId, secondaryTagId, startTime, endTime, studyNodeId) VALUES (?, ?, ?, ?, ?, ?)", [
    title,
    tagId,
    secondaryTagId,
    startTime,
    endTime,
    studyNodeId
  ]);
  const id = lastInsertId(db2);
  return { id, title, tagId, secondaryTagId, startTime, endTime, studyNodeId };
}
async function getStudyHoursByTopic() {
  const db2 = await getDb();
  return getAll(
    db2,
    `SELECT st.id as topicId, st.name as topicName,
            CAST(ROUND(SUM((julianday(COALESCE(t.endTime, 'now')) - julianday(t.startTime)) * 24 * 60)) AS INTEGER) as minutes
     FROM tasks t
     JOIN study_nodes sn ON t.studyNodeId = sn.id
     JOIN study_topics st ON sn.topicId = st.id
     WHERE t.studyNodeId IS NOT NULL
     GROUP BY st.id, st.name
     ORDER BY minutes DESC`
  );
}
async function updateTask(id, title, tagId, secondaryTagId, startTime, endTime) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE tasks SET title = ?, tagId = ?, secondaryTagId = ?, startTime = ?, endTime = ? WHERE id = ?",
    [title, tagId, secondaryTagId, startTime, endTime, id]
  );
  return getOne(db2, "SELECT id, title, tagId, secondaryTagId, startTime, endTime, studyNodeId FROM tasks WHERE id = ?", [id]);
}
async function stopTask(id, endTime) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET endTime = ? WHERE id = ?", [endTime, id]);
}
async function deleteTask(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM tasks WHERE id = ?", [id]);
}
async function stopAllActiveTasks(endTime) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET endTime = ? WHERE endTime IS NULL", [endTime]);
}
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
async function getDailyStats(startDate, endDate) {
  const db2 = await getDb();
  const rows = getAll(
    db2,
    `SELECT t.startTime, t.endTime, tg.isProductive
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     WHERE t.startTime >= ? AND t.startTime < ?`,
    [startDate, endDate]
  );
  const firstDay = localDateKey(new Date(startDate));
  const lastDay = localDateKey(new Date(new Date(endDate).getTime() - 1));
  const byDate = /* @__PURE__ */ new Map();
  const bucket = (date) => {
    let entry = byDate.get(date);
    if (!entry) {
      entry = {
        date,
        totalMinutes: 0,
        productiveMinutes: 0,
        semiProductiveMinutes: 0,
        productiveErosMinutes: 0,
        isWorkDay: 0
      };
      byDate.set(date, entry);
    }
    return entry;
  };
  for (const row of rows) {
    const date = localDateKey(new Date(row.startTime));
    if (date < firstDay || date > lastDay) continue;
    const entry = bucket(date);
    if (!row.endTime) continue;
    const minutes = Math.trunc(
      (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 6e4
    );
    entry.totalMinutes += minutes;
    if (row.isProductive === 1) entry.productiveMinutes += minutes;
    else if (row.isProductive === 2) entry.semiProductiveMinutes += minutes;
    else if (row.isProductive === 3) entry.productiveErosMinutes += minutes;
  }
  const configs = getAll(
    db2,
    "SELECT date, isWorkDay FROM day_configs WHERE date >= ? AND date <= ?",
    [firstDay, lastDay]
  );
  for (const config of configs) {
    bucket(config.date).isWorkDay = config.isWorkDay;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
async function getTagStats(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
    `SELECT tagId, tagName, tagColor, isProductive, SUM(minutes) as totalMinutes
     FROM (
       SELECT t.tagId, tg.name as tagName, tg.color as tagColor, tg.isProductive,
              CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER) as minutes
       FROM tasks t
       JOIN tags tg ON t.tagId = tg.id
       WHERE t.endTime IS NOT NULL AND t.startTime >= ? AND t.startTime < ?
       
       UNION ALL
       
       SELECT t.secondaryTagId as tagId, tg.name as tagName, tg.color as tagColor, tg.isProductive,
              CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER) as minutes
       FROM tasks t
       JOIN tags tg ON t.secondaryTagId = tg.id
       WHERE t.endTime IS NOT NULL AND t.startTime >= ? AND t.startTime < ?
     )
     GROUP BY tagId
     ORDER BY totalMinutes DESC`,
    [startDate, endDate, startDate, endDate]
  );
}
async function updateDayConfig(date, isWorkDay) {
  const db2 = await getDb();
  run(db2, "INSERT OR REPLACE INTO day_configs (date, isWorkDay) VALUES (?, ?)", [date, isWorkDay]);
}
async function fillGapsWithIdle(date) {
  const db2 = await getDb();
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const tasks = getAll(
    db2,
    `SELECT * FROM tasks WHERE startTime >= ? AND startTime <= ? ORDER BY startTime ASC`,
    [dayStart, dayEnd]
  );
  if (tasks.length === 0) return;
  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i];
    const next = tasks[i + 1];
    if (!current.endTime) continue;
    const gap = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    if (gap > 6e4) {
      run(db2, "INSERT INTO tasks (title, tagId, startTime, endTime) VALUES (?, 1, ?, ?)", [
        "Idle",
        current.endTime,
        next.startTime
      ]);
    }
  }
  mergeConsecutiveSameTasksSync(db2);
}
function mergeConsecutiveSameTasksSync(db2) {
  const tasks = getAll(
    db2,
    `SELECT * FROM tasks WHERE endTime IS NOT NULL ORDER BY startTime ASC`
  );
  const toDelete = [];
  const toUpdate = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i];
    const next = tasks[i + 1];
    if (toDelete.includes(current.id)) continue;
    if (current.title === next.title && current.tagId === next.tagId && current.endTime === next.startTime) {
      toUpdate.push({ id: current.id, endTime: next.endTime || current.endTime });
      toDelete.push(next.id);
    }
  }
  for (const upd of toUpdate) {
    run(db2, "UPDATE tasks SET endTime = ? WHERE id = ?", [upd.endTime, upd.id]);
  }
  for (const id of toDelete) {
    run(db2, "DELETE FROM tasks WHERE id = ?", [id]);
  }
}
async function getTodos(status) {
  const db2 = await getDb();
  if (status) {
    return getAll(
      db2,
      "SELECT * FROM todos WHERE status = ? ORDER BY priority DESC, createdAt DESC",
      [status]
    );
  }
  return getAll(db2, "SELECT * FROM todos ORDER BY priority DESC, createdAt DESC");
}
async function createTodo(title, notes, status, source, priority = 0, dueDate = null, projectId = null, aiGenerated = 0, recurrence = null, type = "projeto") {
  const db2 = await getDb();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  run(
    db2,
    "INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, type, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, type, createdAt]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM todos WHERE id = ?", [id]);
}
async function updateTodo(id, title, notes, status, priority, dueDate, projectId, recurrence, type) {
  const db2 = await getDb();
  const prev = getOne(db2, "SELECT status FROM todos WHERE id = ?", [id]);
  const cols = ["title = ?", "notes = ?", "status = ?", "priority = ?", "dueDate = ?", "projectId = ?"];
  const params = [title, notes, status, priority, dueDate, projectId];
  if (recurrence !== void 0) {
    cols.push("recurrence = ?");
    params.push(recurrence);
  }
  if (type !== void 0) {
    cols.push("type = ?");
    params.push(type);
  }
  params.push(id);
  run(db2, `UPDATE todos SET ${cols.join(", ")} WHERE id = ?`, params);
  if (status === "done" && prev?.status !== "done") spawnRecurrenceIfNeeded(db2, id);
  return getOne(db2, "SELECT * FROM todos WHERE id = ?", [id]);
}
function nextDueDate(rec, fromDue) {
  const today = /* @__PURE__ */ new Date();
  const base = fromDue ? /* @__PURE__ */ new Date(`${fromDue}T12:00:00`) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const iso = (d2) => `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
  if (rec.type === "everyNDays") {
    base.setDate(base.getDate() + (rec.n && rec.n > 0 ? rec.n : 1));
    return iso(base);
  }
  if (rec.type === "afterCompletion") {
    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    d2.setDate(d2.getDate() + (rec.n && rec.n > 0 ? rec.n : 1));
    return iso(d2);
  }
  const day = rec.day && rec.day >= 1 && rec.day <= 31 ? rec.day : 1;
  const d = new Date(today.getFullYear(), today.getMonth() + 1, day, 12);
  return iso(d);
}
function spawnRecurrenceIfNeeded(db2, id) {
  const t = getOne(db2, "SELECT * FROM todos WHERE id = ?", [id]);
  if (!t || !t.recurrence) return;
  let rec;
  try {
    rec = JSON.parse(t.recurrence);
  } catch {
    return;
  }
  if (!rec || !rec.type) return;
  const nextDue = nextDueDate(rec, t.dueDate);
  run(
    db2,
    "INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, type, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [t.title, t.notes, "todo", t.priority, nextDue, t.projectId, "recurring", 0, t.recurrence, t.type, (/* @__PURE__ */ new Date()).toISOString()]
  );
}
async function deleteTodo(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM todos WHERE id = ?", [id]);
}
async function getProjects() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM projects ORDER BY archived ASC, name ASC");
}
async function createProject(name, description, githubRepoUrl, color, claudeCommand = null, localPath = null, stage = "ideia", businessModel = null, pricing = null, audience = null) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO projects (name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM projects WHERE id = ?", [id]);
}
async function updateProject(id, name, description, githubRepoUrl, color, archived, claudeCommand = null, localPath = null, stage = "ideia", businessModel = null, pricing = null, audience = null) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE projects SET name = ?, description = ?, githubRepoUrl = ?, color = ?, archived = ?, claudeCommand = ?, localPath = ?, stage = ?, businessModel = ?, pricing = ?, audience = ? WHERE id = ?",
    [name, description, githubRepoUrl, color, archived, claudeCommand, localPath, stage, businessModel, pricing, audience, id]
  );
  return getOne(db2, "SELECT * FROM projects WHERE id = ?", [id]);
}
async function setProjectStage(id, stage) {
  const db2 = await getDb();
  run(db2, "UPDATE projects SET stage = ? WHERE id = ?", [stage, id]);
}
async function getProjectMilestones() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM project_milestones ORDER BY doneAt IS NOT NULL, targetDate IS NULL, targetDate ASC, id ASC");
}
async function createProjectMilestone(projectId, title, targetDate) {
  const db2 = await getDb();
  run(db2, "INSERT INTO project_milestones (projectId, title, targetDate, createdAt) VALUES (?, ?, ?, ?)", [projectId, title, targetDate, (/* @__PURE__ */ new Date()).toISOString()]);
  return getOne(db2, "SELECT * FROM project_milestones WHERE id = ?", [lastInsertId(db2)]);
}
async function toggleProjectMilestone(id, done) {
  const db2 = await getDb();
  run(db2, "UPDATE project_milestones SET doneAt = ? WHERE id = ?", [done ? (/* @__PURE__ */ new Date()).toISOString() : null, id]);
}
async function deleteProjectMilestone(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM project_milestones WHERE id = ?", [id]);
}
async function deleteProject(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM projects WHERE id = ?", [id]);
}
async function getHabits() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM habits ORDER BY id ASC");
}
async function createHabit(name, frequency, target) {
  const db2 = await getDb();
  run(db2, "INSERT INTO habits (name, frequency, target) VALUES (?, ?, ?)", [
    name,
    frequency,
    target
  ]);
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM habits WHERE id = ?", [id]);
}
async function updateHabit(id, name, frequency, target, active) {
  const db2 = await getDb();
  run(db2, "UPDATE habits SET name = ?, frequency = ?, target = ?, active = ? WHERE id = ?", [
    name,
    frequency,
    target,
    active,
    id
  ]);
  return getOne(db2, "SELECT * FROM habits WHERE id = ?", [id]);
}
async function deleteHabit(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM habits WHERE id = ?", [id]);
}
async function getHabitEntries(date) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM habit_entries WHERE date = ?", [date]);
}
async function getHabitEntriesForRange(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM habit_entries WHERE date >= ? AND date <= ? AND completed = 1",
    [startDate, endDate]
  );
}
async function toggleHabitEntry(habitId, date, completed) {
  const db2 = await getDb();
  const completedAt = completed ? (/* @__PURE__ */ new Date()).toISOString() : null;
  run(
    db2,
    `INSERT INTO habit_entries (habitId, date, completed, completedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET completed = excluded.completed, completedAt = excluded.completedAt`,
    [habitId, date, completed, completedAt]
  );
}
async function getHabitCompletionsForDate(date) {
  const db2 = await getDb();
  return getAll(
    db2,
    `SELECT he.habitId, h.name, he.completedAt
     FROM habit_entries he JOIN habits h ON h.id = he.habitId
     WHERE he.date = ? AND he.completed = 1 AND he.completedAt IS NOT NULL
     ORDER BY he.completedAt ASC`,
    [date]
  );
}
async function getSetting(key) {
  const db2 = await getDb();
  const row = getOne(db2, "SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
}
async function setSetting(key, value) {
  const db2 = await getDb();
  run(
    db2,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
async function getAllSettings() {
  const db2 = await getDb();
  const rows = getAll(db2, "SELECT key, value FROM settings");
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
async function getGithubIssues() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM github_issues ORDER BY local DESC, updatedAt DESC");
}
async function createLocalIssue(repo, title, body) {
  const db2 = await getDb();
  const minRow = getOne(db2, "SELECT MIN(id) as m FROM github_issues WHERE id < 0");
  const id = (minRow?.m ?? 0) - 1;
  run(
    db2,
    `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt, local, body)
     VALUES (?, 0, ?, 'open', ?, NULL, '[]', NULL, ?, 1, ?)`,
    [id, title, repo, (/* @__PURE__ */ new Date()).toISOString(), body]
  );
  return getOne(db2, "SELECT * FROM github_issues WHERE id = ?", [id]);
}
async function markIssueOnGithub(id, url, number) {
  const db2 = await getDb();
  run(db2, "UPDATE github_issues SET url = ?, number = ? WHERE id = ?", [url, number, id]);
}
async function deleteGithubIssue(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM github_issues WHERE id = ?", [id]);
}
async function replaceGithubIssues(issues) {
  const db2 = await getDb();
  run(db2, "DELETE FROM github_issues WHERE local = 0");
  for (const i of issues) {
    run(
      db2,
      `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    );
  }
}
async function upsertGithubIssues(issues) {
  const db2 = await getDb();
  for (const i of issues) {
    run(
      db2,
      `INSERT OR REPLACE INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    );
  }
}
async function getUpcomingEvents(fromISO, limit) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM calendar_events WHERE startTime >= ? ORDER BY startTime ASC LIMIT ?",
    [fromISO, limit]
  );
}
async function getEventsForRange(startISO, endISO) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM calendar_events WHERE startTime < ? AND COALESCE(endTime, startTime) > ? ORDER BY startTime ASC",
    [endISO, startISO]
  );
}
async function createCalendarEvent(title, startTime, endTime, location) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO calendar_events (title, startTime, endTime, location, source) VALUES (?, ?, ?, ?, 'manual')",
    [title, startTime, endTime, location]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM calendar_events WHERE id = ?", [id]);
}
async function deleteCalendarEvent(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM calendar_events WHERE id = ?", [id]);
}
async function replaceGoogleEvents(events) {
  const db2 = await getDb();
  run(db2, "DELETE FROM calendar_events WHERE source = 'google'");
  for (const e of events) {
    run(
      db2,
      "INSERT INTO calendar_events (title, startTime, endTime, location, source) VALUES (?, ?, ?, ?, 'google')",
      [e.title, e.startTime, e.endTime, e.location]
    );
  }
}
async function getAccounts$1() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM accounts ORDER BY name");
}
async function createAccount(name, currency, balance) {
  const db2 = await getDb();
  run(db2, "INSERT INTO accounts (name, currency, balance) VALUES (?, ?, ?)", [name, currency, balance]);
  return getOne(db2, "SELECT * FROM accounts WHERE id = ?", [lastInsertId(db2)]);
}
async function updateAccount(id, name, currency, balance) {
  const db2 = await getDb();
  run(db2, "UPDATE accounts SET name = ?, currency = ?, balance = ? WHERE id = ?", [name, currency, balance, id]);
}
async function deleteAccount(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM accounts WHERE id = ?", [id]);
}
async function getCategories() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM categories ORDER BY type DESC, name");
}
async function createCategory(name, type, color) {
  const db2 = await getDb();
  run(db2, "INSERT INTO categories (name, type, color) VALUES (?, ?, ?)", [name, type, color]);
  return getOne(db2, "SELECT * FROM categories WHERE id = ?", [lastInsertId(db2)]);
}
async function deleteCategory(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM categories WHERE id = ?", [id]);
}
async function getTransactions(month) {
  const db2 = await getDb();
  if (month) {
    return getAll(
      db2,
      "SELECT * FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date DESC, id DESC",
      [month]
    );
  }
  return getAll(db2, "SELECT * FROM transactions ORDER BY date DESC, id DESC");
}
async function createTransaction(accountId, categoryId, amount, currency, type, description, date) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [accountId, categoryId, amount, currency, type, description, date]
  );
  return getOne(db2, "SELECT * FROM transactions WHERE id = ?", [lastInsertId(db2)]);
}
async function updateTransaction(id, accountId, categoryId, amount, currency, type, description, date) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE transactions SET accountId = ?, categoryId = ?, amount = ?, currency = ?, type = ?, description = ?, date = ? WHERE id = ?",
    [accountId, categoryId, amount, currency, type, description, date, id]
  );
}
async function deleteTransaction(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM transactions WHERE id = ?", [id]);
}
async function bulkInsertTransactions(rows) {
  const db2 = await getDb();
  for (const r of rows) {
    run(
      db2,
      "INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.accountId, r.categoryId, r.amount, r.currency, r.type, r.description, r.date]
    );
  }
  return rows.length;
}
async function getBudgets(month) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM budgets WHERE month = ?", [month]);
}
async function setBudget(categoryId, month, amount) {
  const db2 = await getDb();
  const existing = getOne(db2, "SELECT * FROM budgets WHERE categoryId = ? AND month = ?", [categoryId, month]);
  if (existing) {
    run(db2, "UPDATE budgets SET amount = ? WHERE id = ?", [amount, existing.id]);
  } else {
    run(db2, "INSERT INTO budgets (categoryId, month, amount) VALUES (?, ?, ?)", [categoryId, month, amount]);
  }
}
function currentMonthKey() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function syncInvestmentLatest(db2, investmentId) {
  const latest = getOne(
    db2,
    "SELECT * FROM investment_history WHERE investmentId = ? ORDER BY month DESC LIMIT 1",
    [investmentId]
  );
  if (latest) run(db2, "UPDATE investments SET amount = ? WHERE id = ?", [latest.amount, investmentId]);
}
async function getInvestments() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM investments ORDER BY name");
}
async function getInvestmentHistory() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM investment_history ORDER BY month");
}
async function createInvestment(name, type, amount, currency) {
  const db2 = await getDb();
  run(db2, "INSERT INTO investments (name, type, amount, currency) VALUES (?, ?, ?, ?)", [name, type, amount, currency]);
  const id = lastInsertId(db2);
  run(db2, "INSERT INTO investment_history (investmentId, month, amount) VALUES (?, ?, ?)", [id, currentMonthKey(), amount]);
  return getOne(db2, "SELECT * FROM investments WHERE id = ?", [id]);
}
async function setInvestmentValue(investmentId, month, amount) {
  const db2 = await getDb();
  const existing = getOne(
    db2,
    "SELECT * FROM investment_history WHERE investmentId = ? AND month = ?",
    [investmentId, month]
  );
  if (existing) {
    run(db2, "UPDATE investment_history SET amount = ? WHERE id = ?", [amount, existing.id]);
  } else {
    run(db2, "INSERT INTO investment_history (investmentId, month, amount) VALUES (?, ?, ?)", [investmentId, month, amount]);
  }
  syncInvestmentLatest(db2, investmentId);
}
async function deleteInvestment(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM investment_history WHERE investmentId = ?", [id]);
  run(db2, "DELETE FROM investments WHERE id = ?", [id]);
}
async function getTrips() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM trips ORDER BY startDate IS NULL, startDate ASC");
}
async function createTrip(origin, destination, startDate, endDate, budget, currency, status) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO trips (origin, destination, startDate, endDate, budget, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [origin, destination, startDate, endDate, budget, currency, status]
  );
  return getOne(db2, "SELECT * FROM trips WHERE id = ?", [lastInsertId(db2)]);
}
async function updateTrip(id, origin, destination, startDate, endDate, budget, currency, status) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE trips SET origin = ?, destination = ?, startDate = ?, endDate = ?, budget = ?, currency = ?, status = ? WHERE id = ?",
    [origin, destination, startDate, endDate, budget, currency, status, id]
  );
}
async function deleteTrip(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM trips WHERE id = ?", [id]);
}
async function getFlightWatches() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM flight_watches ORDER BY id DESC");
}
async function createFlightWatch(tripId, origin, destination, price, currency, lastChecked) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO flight_watches (tripId, origin, destination, price, currency, lastChecked) VALUES (?, ?, ?, ?, ?, ?)",
    [tripId, origin, destination, price, currency, lastChecked]
  );
  return getOne(db2, "SELECT * FROM flight_watches WHERE id = ?", [lastInsertId(db2)]);
}
async function deleteFlightWatch(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM flight_watches WHERE id = ?", [id]);
}
async function updateFlightWatchPrice(id, price, lastChecked) {
  const db2 = await getDb();
  run(db2, "UPDATE flight_watches SET price = ?, lastChecked = ? WHERE id = ?", [price, lastChecked, id]);
}
async function getTripDocuments(tripId) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM trip_documents WHERE tripId = ?", [tripId]);
}
async function setTripDocument(tripId, item, checked) {
  const db2 = await getDb();
  run(
    db2,
    `INSERT INTO trip_documents (tripId, item, checked) VALUES (?, ?, ?)
     ON CONFLICT(tripId, item) DO UPDATE SET checked = excluded.checked`,
    [tripId, item, checked]
  );
}
async function getSkills() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM skills ORDER BY isFavorite DESC, updatedAt DESC");
}
async function createSkill(name, description, category, tags, content) {
  const db2 = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = crypto.randomUUID();
  run(
    db2,
    `INSERT INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, name, description, category, tags, content, now, now]
  );
  return getOne(db2, "SELECT * FROM skills WHERE id = ?", [id]);
}
async function updateSkill(id, name, description, category, tags, content) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE skills SET name = ?, description = ?, category = ?, tags = ?, content = ?, updatedAt = ? WHERE id = ?",
    [name, description, category, tags, content, (/* @__PURE__ */ new Date()).toISOString(), id]
  );
  return getOne(db2, "SELECT * FROM skills WHERE id = ?", [id]);
}
async function deleteSkill(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM skills WHERE id = ?", [id]);
}
async function toggleSkillFavorite(id) {
  const db2 = await getDb();
  run(db2, "UPDATE skills SET isFavorite = 1 - isFavorite WHERE id = ?", [id]);
}
async function importSkill(s) {
  const db2 = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const exists = s.id ? getOne(db2, "SELECT id FROM skills WHERE id = ?", [s.id]) : null;
  const id = exists || !s.id ? crypto.randomUUID() : s.id;
  run(
    db2,
    `INSERT INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      s.name,
      s.description ?? null,
      s.category ?? null,
      s.tags ?? "[]",
      s.content ?? "",
      s.isFavorite ?? 0,
      s.createdAt ?? now,
      now
    ]
  );
  return getOne(db2, "SELECT * FROM skills WHERE id = ?", [id]);
}
async function getAgents() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM agents ORDER BY isFavorite DESC, updatedAt DESC");
}
async function createAgent(name, description, role, systemPrompt, defaultSkillIds, tags) {
  const db2 = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = crypto.randomUUID();
  run(
    db2,
    `INSERT INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, name, description, role, systemPrompt, defaultSkillIds, tags, now, now]
  );
  return getOne(db2, "SELECT * FROM agents WHERE id = ?", [id]);
}
async function updateAgent(id, name, description, role, systemPrompt, defaultSkillIds, tags) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE agents SET name = ?, description = ?, role = ?, systemPrompt = ?, defaultSkillIds = ?, tags = ?, updatedAt = ? WHERE id = ?",
    [name, description, role, systemPrompt, defaultSkillIds, tags, (/* @__PURE__ */ new Date()).toISOString(), id]
  );
  return getOne(db2, "SELECT * FROM agents WHERE id = ?", [id]);
}
async function deleteAgent(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM agents WHERE id = ?", [id]);
}
async function toggleAgentFavorite(id) {
  const db2 = await getDb();
  run(db2, "UPDATE agents SET isFavorite = 1 - isFavorite WHERE id = ?", [id]);
}
async function importAgent(a) {
  const db2 = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const exists = a.id ? getOne(db2, "SELECT id FROM agents WHERE id = ?", [a.id]) : null;
  const id = exists || !a.id ? crypto.randomUUID() : a.id;
  run(
    db2,
    `INSERT INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      a.name,
      a.description ?? null,
      a.role ?? null,
      a.systemPrompt ?? "",
      a.defaultSkillIds ?? "[]",
      a.tags ?? "[]",
      a.isFavorite ?? 0,
      a.createdAt ?? now,
      now
    ]
  );
  return getOne(db2, "SELECT * FROM agents WHERE id = ?", [id]);
}
async function getExecutions() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM prompt_executions ORDER BY createdAt DESC");
}
async function createExecution(agentId, skillIds, userPrompt, finalPrompt, response) {
  const db2 = await getDb();
  const id = crypto.randomUUID();
  run(
    db2,
    `INSERT INTO prompt_executions (id, createdAt, agentId, skillIds, userPrompt, finalPrompt, response)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, (/* @__PURE__ */ new Date()).toISOString(), agentId, skillIds, userPrompt, finalPrompt, response]
  );
  try {
    const ids = JSON.parse(skillIds);
    for (const sid of ids) run(db2, "UPDATE skills SET usageCount = usageCount + 1 WHERE id = ?", [sid]);
  } catch {
  }
  return getOne(db2, "SELECT * FROM prompt_executions WHERE id = ?", [id]);
}
async function deleteExecution(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM prompt_executions WHERE id = ?", [id]);
}
async function getLinks() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM links ORDER BY id ASC");
}
async function createLink(title, url, tags = "[]") {
  const db2 = await getDb();
  run(db2, "INSERT INTO links (title, url, checked, tags, createdAt) VALUES (?, ?, 0, ?, ?)", [
    title,
    url,
    tags,
    (/* @__PURE__ */ new Date()).toISOString()
  ]);
  return getOne(db2, "SELECT * FROM links WHERE id = ?", [lastInsertId(db2)]);
}
async function updateLink(id, title, url, tags = "[]") {
  const db2 = await getDb();
  run(db2, "UPDATE links SET title = ?, url = ?, tags = ? WHERE id = ?", [title, url, tags, id]);
}
async function setLinkChecked(id, checked) {
  const db2 = await getDb();
  run(db2, "UPDATE links SET checked = ? WHERE id = ?", [checked, id]);
}
async function setLinkOpened(id) {
  const db2 = await getDb();
  run(db2, "UPDATE links SET lastOpenedAt = ? WHERE id = ?", [(/* @__PURE__ */ new Date()).toISOString(), id]);
}
async function deleteLink(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM links WHERE id = ?", [id]);
}
async function getStayFavorites() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM travel_stay_favorites ORDER BY createdAt DESC");
}
async function addStayFavorite(f) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT OR REPLACE INTO travel_stay_favorites (id, tripId, provider, listingUrl, title, pricePerNight, currency, data, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [f.id, f.tripId, f.provider, f.listingUrl, f.title, f.pricePerNight, f.currency, f.data, f.createdAt || (/* @__PURE__ */ new Date()).toISOString()]
  );
}
async function removeStayFavorite(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM travel_stay_favorites WHERE id = ?", [id]);
}
async function getStayWatches() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM travel_stay_watches ORDER BY createdAt DESC");
}
async function addStayWatch(w) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT OR REPLACE INTO travel_stay_watches (id, city, filters, currentPrice, bestPrice, currency, lastCheckedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [w.id, w.city, w.filters, w.currentPrice, w.bestPrice, w.currency, w.lastCheckedAt, w.createdAt || (/* @__PURE__ */ new Date()).toISOString()]
  );
}
async function updateStayWatchPrice(id, currentPrice, bestPrice, checkedAt) {
  const db2 = await getDb();
  run(db2, "UPDATE travel_stay_watches SET currentPrice = ?, bestPrice = ?, lastCheckedAt = ? WHERE id = ?", [currentPrice, bestPrice, checkedAt, id]);
}
async function removeStayWatch(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM travel_stay_watches WHERE id = ?", [id]);
  run(db2, "DELETE FROM travel_stay_price_history WHERE watchId = ?", [id]);
}
async function getStayPriceHistory(watchId) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM travel_stay_price_history WHERE watchId = ? ORDER BY checkedAt ASC", [watchId]);
}
async function addStayPricePoint(p) {
  const db2 = await getDb();
  run(db2, "INSERT INTO travel_stay_price_history (id, watchId, checkedAt, price, currency) VALUES (?, ?, ?, ?, ?)", [p.id, p.watchId, p.checkedAt, p.price, p.currency]);
}
async function getStaySearchHistory() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM travel_stay_search_history ORDER BY id DESC LIMIT 20");
}
async function addStaySearchHistory(filters) {
  const db2 = await getDb();
  run(db2, "INSERT INTO travel_stay_search_history (filters, createdAt) VALUES (?, ?)", [filters, (/* @__PURE__ */ new Date()).toISOString()]);
  run(db2, "DELETE FROM travel_stay_search_history WHERE id NOT IN (SELECT id FROM travel_stay_search_history ORDER BY id DESC LIMIT 20)");
}
async function getContacts() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC");
}
async function createContact(name, location, birthday, interests, context, nextFollowUp) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO contacts (name, location, birthday, interests, context, nextFollowUp, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [name, location, birthday, interests, context, nextFollowUp, (/* @__PURE__ */ new Date()).toISOString()]
  );
  return getOne(db2, "SELECT * FROM contacts WHERE id = ?", [lastInsertId(db2)]);
}
async function updateContact(id, name, location, birthday, interests, context, lastContactAt, nextFollowUp) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE contacts SET name = ?, location = ?, birthday = ?, interests = ?, context = ?, lastContactAt = ?, nextFollowUp = ? WHERE id = ?",
    [name, location, birthday, interests, context, lastContactAt, nextFollowUp, id]
  );
  return getOne(db2, "SELECT * FROM contacts WHERE id = ?", [id]);
}
async function logContact(id) {
  const db2 = await getDb();
  run(db2, "UPDATE contacts SET lastContactAt = ?, nextFollowUp = NULL WHERE id = ?", [(/* @__PURE__ */ new Date()).toISOString(), id]);
  return getOne(db2, "SELECT * FROM contacts WHERE id = ?", [id]);
}
async function deleteContact(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM contacts WHERE id = ?", [id]);
}
async function getRules() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM rules ORDER BY id ASC");
}
async function createRule(type, params) {
  const db2 = await getDb();
  run(db2, "INSERT INTO rules (type, enabled, params, createdAt) VALUES (?, 1, ?, ?)", [type, params, (/* @__PURE__ */ new Date()).toISOString()]);
  return getOne(db2, "SELECT * FROM rules WHERE id = ?", [lastInsertId(db2)]);
}
async function updateRule(id, enabled, params) {
  const db2 = await getDb();
  run(db2, "UPDATE rules SET enabled = ?, params = ? WHERE id = ?", [enabled, params, id]);
}
async function setRuleFired(id, at) {
  const db2 = await getDb();
  run(db2, "UPDATE rules SET lastFiredAt = ? WHERE id = ?", [at, id]);
}
async function deleteRule(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM rules WHERE id = ?", [id]);
}
async function getScheduledJobs() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM scheduled_jobs ORDER BY id ASC");
}
async function createScheduledJob(name, prompt, hour) {
  const db2 = await getDb();
  run(db2, "INSERT INTO scheduled_jobs (name, prompt, hour, enabled, createdAt) VALUES (?, ?, ?, 1, ?)", [name, prompt, hour, (/* @__PURE__ */ new Date()).toISOString()]);
  return getOne(db2, "SELECT * FROM scheduled_jobs WHERE id = ?", [lastInsertId(db2)]);
}
async function updateScheduledJob(id, name, prompt, hour, enabled) {
  const db2 = await getDb();
  run(db2, "UPDATE scheduled_jobs SET name = ?, prompt = ?, hour = ?, enabled = ? WHERE id = ?", [name, prompt, hour, enabled, id]);
}
async function setJobRan(id, at) {
  const db2 = await getDb();
  run(db2, "UPDATE scheduled_jobs SET lastRunAt = ? WHERE id = ?", [at, id]);
}
async function deleteScheduledJob(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM scheduled_jobs WHERE id = ?", [id]);
}
async function getGoals(month) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM goals WHERE month = ? ORDER BY done ASC, id ASC", [month]);
}
async function createGoal(month, title, kind, refId, target, unit) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO goals (month, title, kind, refId, target, current, unit, done, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)",
    [month, title, kind, refId, target, unit, (/* @__PURE__ */ new Date()).toISOString()]
  );
  return getOne(db2, "SELECT * FROM goals WHERE id = ?", [lastInsertId(db2)]);
}
async function updateGoal(id, title, target, current, unit, done) {
  const db2 = await getDb();
  run(db2, "UPDATE goals SET title = ?, target = ?, current = ?, unit = ?, done = ? WHERE id = ?", [title, target, current, unit, done, id]);
  return getOne(db2, "SELECT * FROM goals WHERE id = ?", [id]);
}
async function deleteGoal(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM goals WHERE id = ?", [id]);
}
async function getStudyTopics() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM study_topics ORDER BY priority DESC, name ASC");
}
async function createStudyTopic(name, category, status, targetDate, priority, color) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO study_topics (name, category, status, targetDate, priority, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [name, category, status, targetDate, priority, color, (/* @__PURE__ */ new Date()).toISOString()]
  );
  return getOne(db2, "SELECT * FROM study_topics WHERE id = ?", [lastInsertId(db2)]);
}
async function updateStudyTopic(id, name, category, status, targetDate, priority, color) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE study_topics SET name = ?, category = ?, status = ?, targetDate = ?, priority = ?, color = ? WHERE id = ?",
    [name, category, status, targetDate, priority, color, id]
  );
  return getOne(db2, "SELECT * FROM study_topics WHERE id = ?", [id]);
}
async function deleteStudyTopic(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM study_topics WHERE id = ?", [id]);
}
async function getStudyNodes(topicId) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM study_nodes WHERE topicId = ? ORDER BY orderIndex ASC, id ASC", [topicId]);
}
async function getAllStudyNodes() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM study_nodes");
}
async function getAllStudyNotes() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM study_notes");
}
async function createStudyNode(topicId, parentId, title, description, estimatedHours) {
  const db2 = await getDb();
  const siblings = getAll(
    db2,
    "SELECT COALESCE(MAX(orderIndex), -1) + 1 AS n FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1)",
    [topicId, parentId]
  );
  const orderIndex = siblings[0]?.n ?? 0;
  run(
    db2,
    "INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [topicId, parentId, title, description, "todo", orderIndex, estimatedHours, (/* @__PURE__ */ new Date()).toISOString()]
  );
  return getOne(db2, "SELECT * FROM study_nodes WHERE id = ?", [lastInsertId(db2)]);
}
async function updateStudyNode(id, title, description, status, estimatedHours) {
  const db2 = await getDb();
  const completedAt = status === "done" ? (/* @__PURE__ */ new Date()).toISOString() : null;
  run(
    db2,
    "UPDATE study_nodes SET title = ?, description = ?, status = ?, estimatedHours = ?, completedAt = ? WHERE id = ?",
    [title, description, status, estimatedHours, completedAt, id]
  );
  return getOne(db2, "SELECT * FROM study_nodes WHERE id = ?", [id]);
}
async function deleteStudyNode(id) {
  const db2 = await getDb();
  const all = getAll(db2, "SELECT id, parentId FROM study_nodes");
  const toDelete = /* @__PURE__ */ new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of all) {
      if (n.parentId != null && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
        toDelete.add(n.id);
        grew = true;
      }
    }
  }
  for (const nid of toDelete) run(db2, "DELETE FROM study_nodes WHERE id = ?", [nid]);
}
async function reorderStudyNode(id, newParentId, newIndex) {
  const db2 = await getDb();
  const n = getOne(db2, "SELECT * FROM study_nodes WHERE id = ?", [id]);
  if (!n) return;
  if (newParentId != null) {
    const all = getAll(db2, "SELECT id, parentId FROM study_nodes WHERE topicId = ?", [n.topicId]);
    const desc = /* @__PURE__ */ new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of all) {
        if (x.parentId != null && desc.has(x.parentId) && !desc.has(x.id)) {
          desc.add(x.id);
          grew = true;
        }
      }
    }
    if (desc.has(newParentId)) return;
  }
  const siblings = getAll(
    db2,
    "SELECT * FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) AND id <> ? ORDER BY orderIndex ASC, id ASC",
    [n.topicId, newParentId, id]
  );
  const clamped = Math.max(0, Math.min(newIndex, siblings.length));
  siblings.splice(clamped, 0, n);
  run(db2, "UPDATE study_nodes SET parentId = ? WHERE id = ?", [newParentId, id]);
  siblings.forEach((s, i) => run(db2, "UPDATE study_nodes SET orderIndex = ? WHERE id = ?", [i, s.id]));
}
async function moveStudyNode(id, dir) {
  const db2 = await getDb();
  const node = getOne(db2, "SELECT * FROM study_nodes WHERE id = ?", [id]);
  if (!node) return;
  const siblings = getAll(
    db2,
    "SELECT * FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) ORDER BY orderIndex ASC, id ASC",
    [node.topicId, node.parentId]
  );
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = dir === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return;
  run(db2, "UPDATE study_nodes SET orderIndex = ? WHERE id = ?", [swapWith.orderIndex, node.id]);
  run(db2, "UPDATE study_nodes SET orderIndex = ? WHERE id = ?", [node.orderIndex, swapWith.id]);
}
async function getStudyNote(topicId, nodeId) {
  const db2 = await getDb();
  return nodeId == null ? getOne(db2, "SELECT * FROM study_notes WHERE topicId = ? AND nodeId IS NULL", [topicId]) : getOne(db2, "SELECT * FROM study_notes WHERE nodeId = ?", [nodeId]);
}
async function saveStudyNote(topicId, nodeId, content) {
  const db2 = await getDb();
  const existing = await getStudyNote(topicId, nodeId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing) {
    run(db2, "UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?", [content, now, existing.id]);
    return getOne(db2, "SELECT * FROM study_notes WHERE id = ?", [existing.id]);
  }
  run(db2, "INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)", [topicId, nodeId, content, now]);
  return getOne(db2, "SELECT * FROM study_notes WHERE id = ?", [lastInsertId(db2)]);
}
async function getStudyFlashcards(topicId) {
  const db2 = await getDb();
  return topicId == null ? getAll(db2, "SELECT * FROM study_flashcards ORDER BY id DESC") : getAll(db2, "SELECT * FROM study_flashcards WHERE topicId = ? ORDER BY id DESC", [topicId]);
}
async function getDueFlashcards(nowISO) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM study_flashcards WHERE nextReviewAt IS NULL OR nextReviewAt <= ? ORDER BY nextReviewAt ASC, id ASC",
    [nowISO]
  );
}
async function createStudyFlashcard(topicId, nodeId, front, back) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO study_flashcards (topicId, nodeId, front, back, createdAt) VALUES (?, ?, ?, ?, ?)",
    [topicId, nodeId, front, back, (/* @__PURE__ */ new Date()).toISOString()]
  );
  return getOne(db2, "SELECT * FROM study_flashcards WHERE id = ?", [lastInsertId(db2)]);
}
async function updateStudyFlashcard(id, front, back) {
  const db2 = await getDb();
  run(db2, "UPDATE study_flashcards SET front = ?, back = ? WHERE id = ?", [front, back, id]);
  return getOne(db2, "SELECT * FROM study_flashcards WHERE id = ?", [id]);
}
async function deleteStudyFlashcard(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM study_flashcards WHERE id = ?", [id]);
}
async function reviewStudyFlashcard(id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE study_flashcards SET easeFactor = ?, intervalDays = ?, repetitions = ?, nextReviewAt = ?, lastReviewedAt = ? WHERE id = ?",
    [easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, id]
  );
  return getOne(db2, "SELECT * FROM study_flashcards WHERE id = ?", [id]);
}
async function getStudyQuizAttempts(topicId) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM study_quiz_attempts WHERE topicId = ? ORDER BY createdAt DESC LIMIT 20", [topicId]);
}
async function createStudyQuizAttempt(topicId, score, total, durationMs) {
  const db2 = await getDb();
  run(db2, "INSERT INTO study_quiz_attempts (topicId, score, total, durationMs, createdAt) VALUES (?, ?, ?, ?, ?)", [topicId, score, total, durationMs, (/* @__PURE__ */ new Date()).toISOString()]);
  return getOne(db2, "SELECT * FROM study_quiz_attempts WHERE id = ?", [lastInsertId(db2)]);
}
async function getStudyBundle(topicId) {
  const db2 = await getDb();
  const topic = getOne(db2, "SELECT * FROM study_topics WHERE id = ?", [topicId]);
  if (!topic) return null;
  return {
    topic,
    nodes: getAll(db2, "SELECT * FROM study_nodes WHERE topicId = ? ORDER BY orderIndex ASC, id ASC", [topicId]),
    notes: getAll(db2, "SELECT * FROM study_notes WHERE topicId = ?", [topicId]),
    flashcards: getAll(db2, "SELECT * FROM study_flashcards WHERE topicId = ?", [topicId])
  };
}
async function importStudyBundle(bundle) {
  const db2 = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const t = bundle.topic;
  run(
    db2,
    "INSERT INTO study_topics (name, category, status, targetDate, priority, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [t.name, t.category, t.status ?? "studying", t.targetDate, t.priority ?? 0, t.color ?? "#6366f1", now]
  );
  const newTopicId = lastInsertId(db2);
  const nodeIdMap = /* @__PURE__ */ new Map();
  const remaining = [...bundle.nodes ?? []];
  let guard = remaining.length + 5;
  while (remaining.length && guard-- > 0) {
    for (let i = 0; i < remaining.length; ) {
      const n = remaining[i];
      const parentReady = n.parentId == null || nodeIdMap.has(n.parentId);
      if (!parentReady) {
        i++;
        continue;
      }
      run(
        db2,
        "INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, completedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newTopicId, n.parentId == null ? null : nodeIdMap.get(n.parentId) ?? null, n.title, n.description ?? null, n.status ?? "todo", n.orderIndex ?? 0, n.estimatedHours ?? null, n.completedAt ?? null, n.createdAt ?? now]
      );
      nodeIdMap.set(n.id, lastInsertId(db2));
      remaining.splice(i, 1);
    }
  }
  for (const note of bundle.notes ?? []) {
    const mappedNode = note.nodeId == null ? null : nodeIdMap.get(note.nodeId) ?? null;
    run(db2, "INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)", [newTopicId, mappedNode, note.content ?? "", note.updatedAt ?? now]);
  }
  for (const fc of bundle.flashcards ?? []) {
    const mappedNode = fc.nodeId == null ? null : nodeIdMap.get(fc.nodeId) ?? null;
    run(
      db2,
      "INSERT INTO study_flashcards (topicId, nodeId, front, back, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [newTopicId, mappedNode, fc.front, fc.back, fc.easeFactor ?? 2.5, fc.intervalDays ?? 0, fc.repetitions ?? 0, fc.nextReviewAt ?? null, fc.lastReviewedAt ?? null, fc.createdAt ?? now]
    );
  }
  return newTopicId;
}
const SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "github_token",
  "google_client_secret",
  "google_refresh_token",
  "google_accounts",
  "pluggy_client_id",
  "pluggy_client_secret",
  "skyscanner_rapidapi_key"
]);
const ENC_PREFIX = "enc:";
function encodeSecret(key, value) {
  if (!SENSITIVE_KEYS.has(key) || !value) return value;
  if (!electron.safeStorage.isEncryptionAvailable()) return value;
  return ENC_PREFIX + electron.safeStorage.encryptString(value).toString("base64");
}
function decodeSecret(value) {
  if (value == null || !value.startsWith(ENC_PREFIX)) return value;
  try {
    return electron.safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return "";
  }
}
const TIMEOUT_MS = 12e4;
function buildPath() {
  const home = os.homedir();
  const extra = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "bin")
  ];
  return [process.env.PATH || "", ...extra].join(path.delimiter);
}
function shquote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function attempt(bin, prompt, viaShell, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: buildPath() };
    const model = opts.model?.trim();
    const extra = opts.extraArgs ?? [];
    const agentic = !!opts.agentic;
    const streamJson = !!opts.streamJson;
    const useStreamParse = streamJson || agentic;
    const agenticArgs = ["--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "default"];
    const agenticShell = " --input-format stream-json --output-format stream-json --verbose --permission-mode default";
    const jsonArgs = agentic ? agenticArgs : streamJson ? ["--output-format", "stream-json", "--verbose", "--include-partial-messages"] : [];
    const jsonShell = agentic ? agenticShell : streamJson ? " --output-format stream-json --verbose --include-partial-messages" : "";
    const stdio = [agentic ? "pipe" : "ignore", "pipe", "pipe"];
    const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : void 0;
    let child;
    if (viaShell) {
      const shell = process.env.SHELL || "/bin/zsh";
      const modelPart = model ? ' --model "$RICKOS_MODEL"' : "";
      const extraPart = extra.length ? " " + extra.map(shquote).join(" ") : "";
      const promptPart = agentic ? "" : ' -p "$RICKOS_PROMPT"';
      child = child_process.spawn(shell, ["-ilc", `${bin}${extraPart}${modelPart}${jsonShell}${promptPart}`], {
        env: { ...env, RICKOS_PROMPT: prompt, RICKOS_MODEL: model || "" },
        stdio,
        cwd
      });
    } else {
      const args = agentic ? [...extra, ...model ? ["--model", model] : [], ...agenticArgs] : [...extra, ...model ? ["--model", model] : [], ...jsonArgs, "-p", prompt];
      child = child_process.spawn(bin, args, { env, stdio, cwd });
    }
    if (agentic && child.stdin) {
      const userMsg = { type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] } };
      try {
        child.stdin.write(JSON.stringify(userMsg) + "\n");
      } catch {
      }
    }
    opts.registerChild?.(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let lineBuf = "";
    let assistantText = "";
    let finalText = null;
    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let evt;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (agentic && evt.type === "assistant" && evt.message?.content) {
        for (const c of evt.message.content) {
          if (c.type === "text" && c.text) {
            assistantText += c.text;
            opts.onChunk?.("\n" + c.text);
          } else if (c.type === "thinking" && c.thinking) {
            opts.onChunk?.("\n💭 " + c.thinking);
          } else if (c.type === "tool_use") {
            const brief = c.input ? " " + JSON.stringify(c.input).slice(0, 160) : "";
            opts.onChunk?.(`
🔧 ${c.name || "tool"}${brief}`);
          }
        }
        return;
      }
      if (agentic && evt.type === "user" && evt.message?.content) {
        for (const c of evt.message.content) {
          if (c.type === "tool_result") {
            const raw = typeof c.content === "string" ? c.content : Array.isArray(c.content) ? c.content.map((x) => x?.text || "").join("") : "";
            if (raw.trim()) opts.onChunk?.("\n↳ " + raw.trim().slice(0, 500));
          }
        }
        return;
      }
      if (evt.type === "stream_event" && evt.event) {
        const ev = evt.event;
        if (ev.type === "content_block_start" && ev.content_block) {
          if (ev.content_block.type === "thinking") opts.onChunk?.("\n💭 ");
          else if (ev.content_block.type === "tool_use") opts.onChunk?.(`
🔧 ${ev.content_block.name || "tool"} `);
        } else if (ev.type === "content_block_delta" && ev.delta) {
          if (ev.delta.type === "text_delta" && ev.delta.text) {
            assistantText += ev.delta.text;
            opts.onChunk?.(ev.delta.text);
          } else if (ev.delta.type === "thinking_delta" && ev.delta.thinking) {
            opts.onChunk?.(ev.delta.thinking);
          }
        }
      } else if (evt.type === "result" && typeof evt.result === "string") {
        finalText = evt.result;
      }
    };
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Tempo esgotado (${Math.round(timeoutMs / 1e3)}s) executando o Claude CLI.`));
    }, timeoutMs) : null;
    const clear = () => {
      if (timer) clearTimeout(timer);
    };
    if (!child.stdout || !child.stderr) {
      reject(new Error("Falha ao abrir os fluxos de saída do Claude CLI."));
      return;
    }
    child.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      if (useStreamParse) {
        lineBuf += text;
        let idx;
        while ((idx = lineBuf.indexOf("\n")) >= 0) {
          processLine(lineBuf.slice(0, idx));
          lineBuf = lineBuf.slice(idx + 1);
        }
      } else {
        opts.onChunk?.(text);
      }
    });
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clear();
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clear();
      if (useStreamParse && lineBuf.trim()) processLine(lineBuf);
      if (code === 0) {
        resolve(useStreamParse ? finalText ?? (assistantText.trim() || stdout.trim()) : stdout.trim());
      } else {
        reject(new Error(stderr.trim() || (useStreamParse ? finalText ?? "" : "") || `Claude CLI saiu com código ${code}.`));
      }
    });
  });
}
async function runClaude(prompt, command = "claude", opts = {}) {
  const bin = (command || "").trim() || "claude";
  if (!/^[A-Za-z0-9_./-]+$/.test(bin)) {
    throw new Error(`Comando inválido: "${bin}". Use apenas letras, números, ., _, - ou /.`);
  }
  if (!prompt.trim()) throw new Error("Prompt vazio.");
  try {
    return await attempt(bin, prompt, false, opts);
  } catch (err) {
    if (err?.code === "ENOENT") {
      try {
        return await attempt(bin, prompt, true, opts);
      } catch (err2) {
        if (err2?.code === "ENOENT") {
          throw new Error(
            `Comando "${bin}" não encontrado. Verifique o comando do Claude em Configurações e se ele existe (binário ou alias no seu shell).`
          );
        }
        throw err2;
      }
    }
    throw err;
  }
}
const GITHUB_API = "https://api.github.com";
function ghPath() {
  const home = os.homedir();
  const extra = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", path.join(home, ".local", "bin")];
  return [process.env.PATH || "", ...extra].join(path.delimiter);
}
function runGh(args) {
  const attempt2 = (viaShell) => new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: ghPath() };
    const child = viaShell ? child_process.spawn(process.env.SHELL || "/bin/zsh", ["-ilc", `gh ${args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ")}`], { env }) : child_process.spawn("gh", args, { env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => out += d.toString());
    child.stderr.on("data", (d) => err += d.toString());
    child.on("error", (e) => reject(e));
    child.on(
      "close",
      (code) => code === 0 ? resolve(out) : reject(new Error(err.trim() || `gh saiu com código ${code}.`))
    );
  });
  return attempt2(false).catch((e) => {
    if (e?.code === "ENOENT") return attempt2(true);
    throw e;
  });
}
function repoFromIssue(issue) {
  if (issue.repository?.full_name) return issue.repository.full_name;
  if (issue.repository_url) {
    const m = issue.repository_url.match(/repos\/(.+)$/);
    if (m) return m[1];
  }
  return "?";
}
function labelNames(labels) {
  return labels.map((l) => typeof l === "string" ? l : l.name).filter(Boolean);
}
function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}
const MAX_PAGES = 10;
function mapIssue(i) {
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    repo: repoFromIssue(i),
    url: i.html_url ?? null,
    labels: JSON.stringify(labelNames(i.labels ?? [])),
    milestone: i.milestone?.title ?? null,
    updatedAt: i.updated_at ?? null,
    local: 0,
    body: null
  };
}
async function fetchIssuesViaToken(query) {
  const token = decodeSecret(await getSetting("github_token"));
  if (!token) {
    throw new Error("GitHub token não configurado. Vá em Configurações e adicione um token.");
  }
  const headers2 = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RickOS"
  };
  const data = [];
  let url = `${GITHUB_API}/${query}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    const res = await fetch(url, { headers: headers2 });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("Token inválido ou expirado (401).");
      throw new Error(`GitHub API falhou (${res.status}). ${body.slice(0, 140)}`);
    }
    data.push(...await res.json());
    url = parseNextLink(res.headers.get("link"));
    pages++;
  }
  return data;
}
async function fetchIssuesViaGh(query) {
  let out;
  try {
    out = await runGh(["api", query, "--paginate"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e?.code === "ENOENT") {
      throw new Error("`gh` (GitHub CLI) não encontrado. Instale e rode `gh auth login`, ou use o modo Token.");
    }
    throw new Error(`Falha no gh: ${msg}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    const merged = out.replace(/\]\s*\[/g, ",");
    return JSON.parse(merged);
  }
}
async function syncGithubIssues(forceFull = false) {
  const mode = await getSetting("github_auth_mode") || "token";
  const lastSync = await getSetting("github_last_sync");
  const full = forceFull || !lastSync;
  const query = `issues?filter=assigned&state=all&per_page=100&sort=updated` + (full ? "" : `&since=${encodeURIComponent(lastSync)}`);
  const data = mode === "ssh" ? await fetchIssuesViaGh(query) : await fetchIssuesViaToken(query);
  const issues = data.filter((i) => typeof i.number === "number" && typeof i.id === "number").map(mapIssue);
  if (full) await replaceGithubIssues(issues);
  else await upsertGithubIssues(issues);
  await setSetting("github_last_sync", (/* @__PURE__ */ new Date()).toISOString());
  return issues.length;
}
function repoFromUrl(url) {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+\/[^/#?]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}
async function claudeCommandForRepo(repo) {
  const projects = await getProjects();
  const match = projects.find((p) => repoFromUrl(p.githubRepoUrl)?.toLowerCase() === repo.toLowerCase());
  if (match?.claudeCommand && match.claudeCommand.trim()) return match.claudeCommand.trim();
  return await getSetting("claude_command") || "claude";
}
async function createIssueViaClaude(id) {
  const issue = (await getGithubIssues()).find((i) => i.id === id);
  if (!issue) throw new Error("Issue não encontrada.");
  if (issue.url) throw new Error("Essa issue já está no GitHub.");
  const command = await claudeCommandForRepo(issue.repo);
  const body = (issue.body ?? "").replace(/`/g, "'");
  const prompt = `Crie uma issue no GitHub no repositório ${issue.repo} usando o gh CLI (gh issue create --repo ${issue.repo} --title <título> --body <corpo>). Título: "${issue.title}". Corpo: "${body || issue.title}". Ao final, imprima APENAS a URL da issue criada (ex.: https://github.com/${issue.repo}/issues/N).`;
  const out = await runClaude(prompt, command, { extraArgs: ["--allowedTools", "Bash(gh:*)"] });
  const m = out.match(/https?:\/\/github\.com\/[^\s"')]+\/issues\/(\d+)/);
  if (!m) {
    throw new Error(`Não consegui confirmar a criação (sem URL na resposta). Saída: ${out.slice(0, 200)}`);
  }
  await markIssueOnGithub(id, m[0], Number(m[1]));
  return (await getGithubIssues()).find((i) => i.id === id);
}
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file";
function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function creds() {
  const clientId = await getSetting("google_client_id") ?? "";
  const clientSecret = decodeSecret(await getSetting("google_client_secret")) ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Configure o Client ID e o Client Secret do Google em Configurações.");
  }
  return { clientId, clientSecret };
}
async function getAccounts() {
  const raw = decodeSecret(await getSetting("google_accounts"));
  let list = [];
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) list = v.filter((a) => a && a.refreshToken);
    } catch {
    }
  }
  const legacy = decodeSecret(await getSetting("google_refresh_token"));
  if (legacy && !list.some((a) => a.refreshToken === legacy)) {
    list = [{ email: "Conta principal", refreshToken: legacy }, ...list];
  }
  return list;
}
async function saveAccounts(list) {
  await setSetting("google_accounts", encodeSecret("google_accounts", JSON.stringify(list)));
  await setSetting("google_refresh_token", "");
}
async function addAccount(email, refreshToken) {
  const list = (await getAccounts()).filter((a) => a.email !== email);
  list.push({ email, refreshToken });
  await saveAccounts(list);
}
async function listGoogleAccounts() {
  return (await getAccounts()).map((a) => a.email);
}
async function uploadFileToDrive(filePath, fileName, email) {
  const accounts = await getAccounts();
  if (!accounts.length) throw new Error("Nenhuma conta Google conectada.");
  const acc = email && accounts.find((a) => a.email === email) || accounts[0];
  const token = await accessTokenFor(acc.refreshToken);
  const bytes = fs.readFileSync(filePath);
  const boundary = "rickos_" + crypto.randomBytes(8).toString("hex");
  const meta = JSON.stringify({ name: fileName, mimeType: "application/x-sqlite3" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${meta}\r
`),
    Buffer.from(`--${boundary}\r
Content-Type: application/octet-stream\r
\r
`),
    bytes,
    Buffer.from(`\r
--${boundary}--\r
`)
  ]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 403 || /insufficient|scope/i.test(t)) {
      throw new Error("Sem permissão de Drive nesta conta. Reconecte-a em Configurações (escopo drive.file).");
    }
    throw new Error(`Upload ao Drive falhou (${res.status}). ${t.slice(0, 120)}`);
  }
  const j = await res.json();
  return { name: j.name || fileName, link: j.webViewLink ?? null, account: acc.email };
}
async function connectGoogle() {
  const { clientId, clientSecret } = await creds();
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "", `http://127.0.0.1`);
        if (!url.searchParams.get("code") && !url.searchParams.get("error")) {
          res.end("OK");
          return;
        }
        const respond = (msg) => {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<html><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;padding:40px"><h2>${msg}</h2><p>Pode fechar esta aba e voltar ao RickOS.</p></body></html>`);
        };
        const err = url.searchParams.get("error");
        if (err) {
          respond("Autorização cancelada.");
          cleanup();
          reject(new Error(`Google negou: ${err}`));
          return;
        }
        if (url.searchParams.get("state") !== state) {
          respond("Falha de segurança (state).");
          cleanup();
          reject(new Error("state inválido no callback do Google."));
          return;
        }
        const code = url.searchParams.get("code");
        const redirectUri = `http://127.0.0.1:${port}`;
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier
        });
        const tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        const json = await tokenRes.json();
        if (!tokenRes.ok || !json.refresh_token) {
          respond("Falha ao trocar o código.");
          cleanup();
          reject(new Error(json.error || "Sem refresh_token (revogue o acesso e tente de novo)."));
          return;
        }
        let email = "conta google";
        if (json.access_token) {
          const resolved = await fetchPrimaryEmail(json.access_token);
          if (resolved) email = resolved;
        }
        await addAccount(email, json.refresh_token);
        respond(`✅ Conectado: ${email}`);
        cleanup();
        resolve(true);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    let port = 0;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado aguardando a autorização do Google."));
    }, 18e4);
    function cleanup() {
      clearTimeout(timer);
      server.close();
    }
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = `${AUTH_ENDPOINT}?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      }).toString();
      electron.shell.openExternal(authUrl);
    });
  });
}
async function googleConnected() {
  return (await getAccounts()).length > 0;
}
async function disconnectGoogle() {
  await setSetting("google_accounts", "");
  await setSetting("google_refresh_token", "");
}
async function disconnectGoogleAccount(email) {
  const list = (await getAccounts()).filter((a) => a.email !== email);
  await saveAccounts(list);
}
async function accessTokenFor(refreshToken) {
  const { clientId, clientSecret } = await creds();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(json.error || "Falha ao renovar o token do Google.");
  return json.access_token;
}
async function fetchPrimaryEmail(token) {
  try {
    const r = await fetch(`${CALENDAR_API}/calendars/primary`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.id ?? null;
  } catch {
    return null;
  }
}
async function fetchEventsFor(token, timeMin, timeMax) {
  const url = `${CALENDAR_API}/calendars/primary/events?` + new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50"
  }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar falhou (${res.status}). ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  return (data.items ?? []).map((e) => ({
    title: e.summary || "(sem título)",
    startTime: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00.000Z` : null),
    endTime: e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00.000Z` : null),
    location: e.location || null
  })).filter((e) => !!e.startTime);
}
async function syncGoogleCalendar() {
  const accounts = await getAccounts();
  if (!accounts.length) throw new Error("Google não conectado. Clique em Conectar em Configurações.");
  const now = /* @__PURE__ */ new Date();
  const in7 = new Date(now.getTime() + 7 * 864e5);
  const all = [];
  let okCount = 0;
  let emailsChanged = false;
  let lastErr = null;
  for (const acc of accounts) {
    try {
      const token = await accessTokenFor(acc.refreshToken);
      if (!acc.email.includes("@")) {
        const email = await fetchPrimaryEmail(token);
        if (email) {
          acc.email = email;
          emailsChanged = true;
        }
      }
      all.push(...await fetchEventsFor(token, now, in7));
      okCount++;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (emailsChanged) await saveAccounts(accounts);
  if (okCount === 0 && lastErr) throw lastErr;
  await replaceGoogleEvents(all);
  return all.length;
}
const PLUGGY_API = "https://api.pluggy.ai";
const OUTROS_CATEGORY_ID = 6;
async function loadFx() {
  const base = await getSetting("finance_base") || "BRL";
  let rates = {};
  try {
    const raw = await getSetting("finance_rates");
    rates = raw ? JSON.parse(raw) : {};
  } catch {
    rates = {};
  }
  return { base, rates };
}
function toBrl(t, acc, fx) {
  const cur = (t.currencyCode || acc.currencyCode || "BRL").toUpperCase();
  if (cur === "BRL") return Math.abs(t.amount);
  const accCur = (acc.currencyCode || "BRL").toUpperCase();
  if (accCur === "BRL" && t.amountInAccountCurrency != null) return Math.abs(t.amountInAccountCurrency);
  const rate = fx.rates[cur];
  if (fx.base === "BRL" && rate) return Math.abs(t.amount) * rate;
  return Math.abs(t.amount);
}
async function apiKey() {
  const clientId = (decodeSecret(await getSetting("pluggy_client_id")) ?? "").trim();
  const clientSecret = (decodeSecret(await getSetting("pluggy_client_secret")) ?? "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Configure o Client ID e o Client Secret do Pluggy em Configurações.");
  }
  let res;
  try {
    res = await fetch(`${PLUGGY_API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret })
    });
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await res.text().catch(() => "");
  let json = {};
  try {
    json = JSON.parse(body);
  } catch {
  }
  if (!res.ok || !json.apiKey) {
    const detail = json.message || body.slice(0, 160) || res.statusText;
    throw new Error(`Falha ao autenticar no Pluggy (${res.status}). ${detail}`);
  }
  return json.apiKey;
}
async function createConnectToken() {
  const key = await apiKey();
  let res;
  try {
    res = await fetch(`${PLUGGY_API}/connect_token`, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await res.text().catch(() => "");
  let json = {};
  try {
    json = JSON.parse(body);
  } catch {
  }
  if (!res.ok || !json.accessToken) {
    throw new Error(`Falha ao criar connect token (${res.status}). ${json.message || body.slice(0, 160)}`);
  }
  return json.accessToken;
}
async function get(path2, key) {
  const res = await fetch(`${PLUGGY_API}${path2}`, { headers: { "X-API-KEY": key } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pluggy ${path2} falhou (${res.status}). ${body.slice(0, 120)}`);
  }
  return await res.json();
}
async function fetchAllTransactions(accountId, key) {
  const out = [];
  let after = null;
  for (let i = 0; i < 200; i++) {
    const qs = new URLSearchParams({ accountId });
    if (after) qs.set("after", after);
    const page = await get(
      `/v2/transactions?${qs.toString()}`,
      key
    );
    out.push(...page.results ?? []);
    if (!page.next) break;
    try {
      after = new URL(page.next, PLUGGY_API).searchParams.get("after");
    } catch {
      after = null;
    }
    if (!after) break;
  }
  return out;
}
async function syncPluggy() {
  const itemId = await getSetting("pluggy_item_id") ?? "";
  if (!itemId) throw new Error("Configure o Item ID do Pluggy (banco conectado) em Configurações.");
  const key = await apiKey();
  const accounts = (await get(`/accounts?itemId=${encodeURIComponent(itemId)}`, key)).results;
  if (!accounts || accounts.length === 0) {
    throw new Error("Nenhuma conta encontrada para esse Item ID. Verifique se o Item está conectado e pronto no Pluggy (e se o Item ID está correto).");
  }
  const fx = await loadFx();
  const incoming = [];
  for (const acc of accounts) {
    const txs = await fetchAllTransactions(acc.id, key);
    for (const t of txs) {
      const isExpense = t.type === "DEBIT" || t.amount < 0;
      incoming.push({
        accountId: null,
        categoryId: OUTROS_CATEGORY_ID,
        amount: Math.round(toBrl(t, acc, fx) * 100) / 100,
        // padroniza tudo em BRL
        currency: "BRL",
        type: isExpense ? "expense" : "income",
        description: t.description ?? null,
        date: t.date.slice(0, 10)
      });
    }
  }
  const existing = await getTransactions();
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.description ?? ""}`));
  const fresh = incoming.filter((t) => !seen.has(`${t.date}|${t.amount}|${t.description ?? ""}`));
  if (fresh.length) await bulkInsertTransactions(fresh);
  return { imported: fresh.length, skipped: incoming.length - fresh.length };
}
async function pluggyConfigured() {
  return !!await getSetting("pluggy_client_id") && !!await getSetting("pluggy_item_id");
}
const DEFAULT_HOST = "sky-scanner3.p.rapidapi.com";
async function cfg() {
  const key = decodeSecret(await getSetting("skyscanner_rapidapi_key")) ?? "";
  const host = await getSetting("skyscanner_rapidapi_host") || DEFAULT_HOST;
  if (!key) throw new Error("Configure a RapidAPI Key do Skyscanner em Configurações.");
  return { key, host };
}
function headers(key, host) {
  return { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host };
}
function defaultDate() {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function resolvePlace(query, key, host) {
  const url = `https://${host}/flights/auto-complete?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: headers(key, host) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `auto-complete 404 em ${host}. O host/endpoint não bate com a API Skyscanner assinada. URL: ${url}. Ajuste o host em Configurações (ex.: sky-scanner3.p.rapidapi.com) ou me diga qual API do RapidAPI você assinou.`
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Não autorizado (${res.status}) no ${host}. Verifique a RapidAPI Key e se você está inscrito nessa API.`);
    }
    throw new Error(`auto-complete falhou (${res.status}) em ${host}. ${body.slice(0, 120)}`);
  }
  const json = await res.json();
  const first = (json.data ?? [])[0];
  if (!first) throw new Error(`Local não encontrado: "${query}".`);
  const nav = first.navigation ?? {};
  const rel = nav.relevantFlightParams ?? {};
  const entityId = rel.entityId ?? nav.entityId ?? first.entityId;
  const skyId = rel.skyId ?? first.skyId;
  if (!entityId) throw new Error(`Não consegui resolver o ID de "${query}".`);
  return { skyId, entityId };
}
function deepMinPrice(obj) {
  let min = Infinity;
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === "price" && v && typeof v === "object" && typeof v.raw === "number") {
        const raw = v.raw;
        if (raw > 0) min = Math.min(min, raw);
      } else if (k === "price" && typeof v === "number" && v > 0) {
        min = Math.min(min, v);
      } else {
        walk(v);
      }
    }
  };
  walk(obj);
  return isFinite(min) ? Math.round(min * 100) / 100 : null;
}
async function searchFlightPrice(origin, destination, currency = "BRL", date) {
  const { key, host } = await cfg();
  const dep = date || defaultDate();
  const from = await resolvePlace(origin, key, host);
  const to = await resolvePlace(destination, key, host);
  const params = new URLSearchParams({
    fromEntityId: from.entityId,
    toEntityId: to.entityId,
    departDate: dep,
    currency
  });
  const res = await fetch(`https://${host}/flights/search-one-way?${params.toString()}`, {
    headers: headers(key, host)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Busca de voos falhou (${res.status}). ${body.slice(0, 120)}`);
  }
  const min = deepMinPrice(await res.json());
  if (min == null) throw new Error("Nenhum preço encontrado para essa rota/data.");
  return min;
}
async function refreshWatchPrice(id) {
  const w = (await getFlightWatches()).find((x) => x.id === id);
  if (!w) throw new Error("Trecho não encontrado.");
  if (!w.origin || !w.destination) throw new Error("O trecho precisa de origem e destino para buscar.");
  let date = null;
  if (w.tripId != null) {
    const trip = (await getTrips()).find((t) => t.id === w.tripId);
    date = trip?.startDate ?? null;
  }
  const price = await searchFlightPrice(w.origin, w.destination, w.currency, date);
  await updateFlightWatchPrice(id, price, (/* @__PURE__ */ new Date()).toISOString());
  return (await getFlightWatches()).find((x) => x.id === id);
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}
const DAY_MS = 24 * 60 * 60 * 1e3;
async function maybeAutoSyncGoogle() {
  try {
    if (!await googleConnected()) return;
    const last = await getSetting("google_last_sync");
    if (last && Date.now() - new Date(last).getTime() < DAY_MS) return;
    const n = await syncGoogleCalendar();
    await setSetting("google_last_sync", (/* @__PURE__ */ new Date()).toISOString());
    broadcast("calendar:updated", { source: "google", count: n });
  } catch {
  }
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.globalShortcut.register("CommandOrControl+Shift+Space", () => {
    const win = electron.BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("quick-capture:open");
  });
  getDb().then(() => snapshotDailyIfNeeded());
  setTimeout(() => void evaluateRules(), 15e3);
  setInterval(() => void evaluateRules(), 60 * 1e3);
  setTimeout(() => void runScheduledJobs(), 2e4);
  setInterval(() => void runScheduledJobs(), 5 * 60 * 1e3);
  setTimeout(() => void maybeAutoSyncGoogle(), 8e3);
  setInterval(() => void maybeAutoSyncGoogle(), 6 * 60 * 60 * 1e3);
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("tags:getAll", () => getAllTags());
electron.ipcMain.handle(
  "tags:create",
  (_, name, color, isProductive) => createTag(name, color, isProductive)
);
electron.ipcMain.handle(
  "tags:update",
  (_, id, name, color, isProductive) => updateTag(id, name, color, isProductive)
);
electron.ipcMain.handle("tags:delete", (_, id) => deleteTag(id));
electron.ipcMain.handle("tasks:getAll", () => getAllTasks());
electron.ipcMain.handle(
  "tasks:getForRange",
  (_, startDate, endDate) => getTasksForRange(startDate, endDate)
);
electron.ipcMain.handle("tasks:getActive", () => getActiveTask());
electron.ipcMain.handle("tasks:start", async (_, title, tagId, secondaryTagId, startTime, studyNodeId) => {
  const now = startTime || (/* @__PURE__ */ new Date()).toISOString();
  await stopAllActiveTasks(now);
  return createTask(title, tagId, secondaryTagId, now, null, studyNodeId ?? null);
});
electron.ipcMain.handle("tasks:stop", async (_, id, endTime) => {
  const now = endTime || (/* @__PURE__ */ new Date()).toISOString();
  await stopTask(id, now);
});
electron.ipcMain.handle(
  "tasks:update",
  (_, id, title, tagId, secondaryTagId, startTime, endTime) => updateTask(id, title, tagId, secondaryTagId, startTime, endTime)
);
electron.ipcMain.handle("tasks:delete", (_, id) => deleteTask(id));
electron.ipcMain.handle(
  "tasks:add",
  (_, title, tagId, secondaryTagId, startTime, endTime, studyNodeId) => createTask(title, tagId, secondaryTagId, startTime, endTime, studyNodeId ?? null)
);
electron.ipcMain.handle("tasks:stopAll", (_, endTime) => stopAllActiveTasks(endTime));
electron.ipcMain.handle("tasks:studyHours", () => getStudyHoursByTopic());
electron.ipcMain.handle("tasks:fillGaps", (_, date) => fillGapsWithIdle(date));
electron.ipcMain.handle(
  "stats:daily",
  (_, startDate, endDate) => getDailyStats(startDate, endDate)
);
electron.ipcMain.handle(
  "stats:byTag",
  (_, startDate, endDate) => getTagStats(startDate, endDate)
);
electron.ipcMain.handle(
  "dayConfig:update",
  (_, date, isWorkDay) => updateDayConfig(date, isWorkDay)
);
electron.ipcMain.handle("todos:getAll", (_, status) => getTodos(status));
electron.ipcMain.handle(
  "todos:create",
  (_, title, notes, status, source, priority, dueDate, projectId, aiGenerated, recurrence, type) => createTodo(title, notes, status, source, priority, dueDate, projectId, aiGenerated ?? 0, recurrence ?? null, type ?? "projeto")
);
electron.ipcMain.handle(
  "todos:update",
  (_, id, title, notes, status, priority, dueDate, projectId, recurrence, type) => updateTodo(id, title, notes, status, priority, dueDate, projectId, recurrence, type)
);
electron.ipcMain.handle("todos:delete", (_, id) => deleteTodo(id));
electron.ipcMain.handle("goals:getForMonth", (_, month) => getGoals(month));
electron.ipcMain.handle("goals:create", (_, month, title, kind, refId, target, unit) => createGoal(month, title, kind, refId, target, unit));
electron.ipcMain.handle("goals:update", (_, id, title, target, current, unit, done) => updateGoal(id, title, target, current, unit, done));
electron.ipcMain.handle("goals:delete", (_, id) => deleteGoal(id));
electron.ipcMain.handle("stays:favorites", () => getStayFavorites());
electron.ipcMain.handle("stays:addFavorite", (_, f) => addStayFavorite(f));
electron.ipcMain.handle("stays:removeFavorite", (_, id) => removeStayFavorite(id));
electron.ipcMain.handle("stays:watches", () => getStayWatches());
electron.ipcMain.handle("stays:addWatch", (_, w) => addStayWatch(w));
electron.ipcMain.handle("stays:updateWatchPrice", (_, id, current, best, at) => updateStayWatchPrice(id, current, best, at));
electron.ipcMain.handle("stays:removeWatch", (_, id) => removeStayWatch(id));
electron.ipcMain.handle("stays:priceHistory", (_, watchId) => getStayPriceHistory(watchId));
electron.ipcMain.handle("stays:addPricePoint", (_, p) => addStayPricePoint(p));
electron.ipcMain.handle("stays:searchHistory", () => getStaySearchHistory());
electron.ipcMain.handle("stays:addSearchHistory", (_, filters) => addStaySearchHistory(filters));
electron.ipcMain.handle("contacts:getAll", () => getContacts());
electron.ipcMain.handle("contacts:create", (_, name, location, birthday, interests, context, nextFollowUp) => createContact(name, location, birthday, interests, context, nextFollowUp));
electron.ipcMain.handle("contacts:update", (_, id, name, location, birthday, interests, context, lastContactAt, nextFollowUp) => updateContact(id, name, location, birthday, interests, context, lastContactAt, nextFollowUp));
electron.ipcMain.handle("contacts:log", (_, id) => logContact(id));
electron.ipcMain.handle("contacts:delete", (_, id) => deleteContact(id));
electron.ipcMain.handle("rules:getAll", () => getRules());
electron.ipcMain.handle("rules:create", (_, type, params) => createRule(type, params));
electron.ipcMain.handle("rules:update", (_, id, enabled, params) => updateRule(id, enabled, params));
electron.ipcMain.handle("rules:delete", (_, id) => deleteRule(id));
electron.ipcMain.handle("jobs:getAll", () => getScheduledJobs());
electron.ipcMain.handle("jobs:create", (_, name, prompt, hour) => createScheduledJob(name, prompt, hour));
electron.ipcMain.handle("jobs:update", (_, id, name, prompt, hour, enabled) => updateScheduledJob(id, name, prompt, hour, enabled));
electron.ipcMain.handle("jobs:delete", (_, id) => deleteScheduledJob(id));
function notifyNative(title, body) {
  try {
    if (electron.Notification.isSupported()) new electron.Notification({ title, body }).show();
  } catch {
  }
}
function todayRangeISO() {
  const n = /* @__PURE__ */ new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(),
    end: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString()
  };
}
let runningJobs = false;
async function runScheduledJobs() {
  if (runningJobs) return;
  runningJobs = true;
  try {
    const jobs = (await getScheduledJobs()).filter((j) => j.enabled);
    const now = /* @__PURE__ */ new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const job of jobs) {
      if (now.getHours() < job.hour) continue;
      const ranDay = job.lastRunAt ? job.lastRunAt.slice(0, 10) : "";
      if (ranDay === todayStr) continue;
      await setJobRan(job.id, todayStr);
      try {
        const command = await resolveClaudeCommand();
        const out = await runClaude(job.prompt, command, { model: await resolveModel(), timeoutMs: 0 });
        const text = (out || "").trim();
        if (text) {
          await createTodo(`🤖 ${job.name}`, text.slice(0, 4e3), "inbox", "agent", 1, null, null, 1);
          broadcast("inbox:updated", { jobId: job.id });
        }
      } catch {
      }
    }
  } finally {
    runningJobs = false;
  }
}
let evaluatingRules = false;
async function evaluateRules() {
  if (evaluatingRules) return;
  evaluatingRules = true;
  try {
    const rules = (await getRules()).filter((r) => r.enabled);
    const now = Date.now();
    for (const r of rules) {
      let params = {};
      try {
        params = JSON.parse(r.params);
      } catch {
      }
      const last = r.lastFiredAt ? new Date(r.lastFiredAt).getTime() : 0;
      try {
        if (r.type === "idle_productive") {
          const minutes = params.minutes ?? 45;
          const startHour = params.startHour ?? 9;
          const endHour = params.endHour ?? 18;
          const h = (/* @__PURE__ */ new Date()).getHours();
          if (h < startHour || h >= endHour) continue;
          if (now - last < minutes * 6e4) continue;
          const { start, end } = todayRangeISO();
          const tasks = await getTasksForRange(start, end);
          const productive = tasks.filter((t) => (t.tagIsProductive ?? 0) !== 0);
          if (productive.some((t) => !t.endTime)) continue;
          let lastEnd = 0;
          for (const t of productive) {
            const e = t.endTime ? new Date(t.endTime).getTime() : 0;
            if (e > lastEnd) lastEnd = e;
          }
          const workStart = /* @__PURE__ */ new Date();
          workStart.setHours(startHour, 0, 0, 0);
          const ref = lastEnd || workStart.getTime();
          if (now - ref >= minutes * 6e4) {
            notifyNative("⏳ Hora de focar?", `Você está há ~${Math.round((now - ref) / 6e4)}min sem tarefa produtiva.`);
            await setRuleFired(r.id, (/* @__PURE__ */ new Date()).toISOString());
          }
        } else if (r.type === "due_flashcards") {
          const count2 = params.count ?? 30;
          if (now - last < 6 * 3600 * 1e3) continue;
          const due = await getDueFlashcards((/* @__PURE__ */ new Date()).toISOString());
          if (due.length > count2) {
            notifyNative("🔁 Revisões acumulando", `${due.length} flashcards vencidos — hora de revisar.`);
            await setRuleFired(r.id, (/* @__PURE__ */ new Date()).toISOString());
          }
        } else if (r.type === "budget_threshold") {
          const percent = params.percent ?? 80;
          if (now - last < 24 * 3600 * 1e3) continue;
          const month = `${(/* @__PURE__ */ new Date()).getFullYear()}-${String((/* @__PURE__ */ new Date()).getMonth() + 1).padStart(2, "0")}`;
          const budgets = await getBudgets(month);
          if (!budgets.length) continue;
          const txs = await getTransactions(month);
          const spent = {};
          for (const t of txs) if (t.type === "expense" && t.categoryId != null) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + t.amount;
          const crossed = budgets.filter((b) => b.categoryId != null && b.amount > 0 && (spent[b.categoryId] ?? 0) / b.amount * 100 > percent);
          if (crossed.length) {
            const cats = await getCategories();
            const names = crossed.map((b) => cats.find((c) => c.id === b.categoryId)?.name ?? `#${b.categoryId}`);
            await createTodo(`Revisar orçamento: ${names.join(", ")} passou de ${percent}%`, "Gerado por regra automática", "inbox", "rule", 2, null, null, 1);
            notifyNative("💸 Orçamento estourando", `${names.join(", ")} passou de ${percent}%.`);
            await setRuleFired(r.id, (/* @__PURE__ */ new Date()).toISOString());
          }
        }
      } catch {
      }
    }
  } finally {
    evaluatingRules = false;
  }
}
electron.ipcMain.handle("inbox:ocr", async (_, base64, ext) => {
  const dir = path.join(electron.app.getPath("temp"), "rickos-ocr");
  fs.mkdirSync(dir, { recursive: true });
  const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext : "png";
  const file = path.join(dir, `${crypto.randomUUID()}.${safeExt}`);
  const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  const prompt = `Você recebeu o caminho de uma imagem: ${file}
Use a ferramenta Read para abrir a imagem e extraia as informações em JSON.
Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), no formato:
{ "title": string, "amount": number|null, "currency": string|null, "date": "YYYY-MM-DD"|null, "link": string|null, "note": string|null }
Regras:
- "title": tarefa/assunto curto e acionável que resume a imagem (comece com um verbo quando fizer sentido).
- "amount"/"currency": se houver valor monetário (boleto, comprovante, recibo).
- "date": se houver uma data relevante (vencimento, evento) — formato YYYY-MM-DD.
- "link": URL visível na imagem.
- "note": detalhes úteis (ex.: itens de um quadro branco, linha digitável do boleto).
- Campos ausentes = null.`;
  try {
    const command = await resolveClaudeCommand();
    const out = await runClaude(prompt, command, {
      model: await resolveModel(),
      extraArgs: ["--allowedTools", "Read"],
      timeoutMs: 18e4
    });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
    }
  }
});
electron.ipcMain.handle("projects:getAll", () => getProjects());
electron.ipcMain.handle(
  "projects:create",
  (_, name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) => createProject(name, description, githubRepoUrl, color, claudeCommand, localPath ?? null, stage ?? "ideia", businessModel ?? null, pricing ?? null, audience ?? null)
);
electron.ipcMain.handle(
  "projects:update",
  (_, id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath, stage, businessModel, pricing, audience) => updateProject(id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath ?? null, stage ?? "ideia", businessModel ?? null, pricing ?? null, audience ?? null)
);
electron.ipcMain.handle("projects:setStage", (_, id, stage) => setProjectStage(id, stage));
electron.ipcMain.handle("projects:delete", (_, id) => deleteProject(id));
electron.ipcMain.handle("milestones:getAll", () => getProjectMilestones());
electron.ipcMain.handle("milestones:create", (_, projectId, title, targetDate) => createProjectMilestone(projectId, title, targetDate));
electron.ipcMain.handle("milestones:toggle", (_, id, done) => toggleProjectMilestone(id, done));
electron.ipcMain.handle("milestones:delete", (_, id) => deleteProjectMilestone(id));
electron.ipcMain.handle("habits:getAll", () => getHabits());
electron.ipcMain.handle(
  "habits:create",
  (_, name, frequency, target) => createHabit(name, frequency, target)
);
electron.ipcMain.handle(
  "habits:update",
  (_, id, name, frequency, target, active) => updateHabit(id, name, frequency, target, active)
);
electron.ipcMain.handle("habits:delete", (_, id) => deleteHabit(id));
electron.ipcMain.handle("habits:getEntries", (_, date) => getHabitEntries(date));
electron.ipcMain.handle(
  "habits:getEntriesRange",
  (_, startDate, endDate) => getHabitEntriesForRange(startDate, endDate)
);
electron.ipcMain.handle(
  "habits:toggleEntry",
  (_, habitId, date, completed) => toggleHabitEntry(habitId, date, completed)
);
electron.ipcMain.handle("habits:completionsForDate", (_, date) => getHabitCompletionsForDate(date));
electron.ipcMain.handle("settings:get", async (_, key) => decodeSecret(await getSetting(key)));
electron.ipcMain.handle("settings:set", (_, key, value) => setSetting(key, encodeSecret(key, value)));
electron.ipcMain.handle("settings:getAll", async () => {
  const all = await getAllSettings();
  for (const k of Object.keys(all)) all[k] = decodeSecret(all[k]) ?? "";
  return all;
});
electron.ipcMain.handle("github:getIssues", () => getGithubIssues());
electron.ipcMain.handle("github:sync", () => syncGithubIssues(true));
electron.ipcMain.handle(
  "github:createLocal",
  (_, repo, title, body) => createLocalIssue(repo, title, body)
);
electron.ipcMain.handle("github:deleteIssue", (_, id) => deleteGithubIssue(id));
electron.ipcMain.handle("github:createOnGithub", (_, id) => createIssueViaClaude(id));
electron.ipcMain.handle(
  "calendar:upcoming",
  (_, fromISO, limit) => getUpcomingEvents(fromISO, limit)
);
electron.ipcMain.handle(
  "calendar:range",
  (_, startISO, endISO) => getEventsForRange(startISO, endISO)
);
electron.ipcMain.handle(
  "calendar:create",
  (_, title, startTime, endTime, location) => createCalendarEvent(title, startTime, endTime, location)
);
electron.ipcMain.handle("calendar:delete", (_, id) => deleteCalendarEvent(id));
electron.ipcMain.handle("google:connect", () => connectGoogle());
electron.ipcMain.handle("google:status", () => googleConnected());
electron.ipcMain.handle("google:accounts", () => listGoogleAccounts());
electron.ipcMain.handle("google:disconnect", () => disconnectGoogle());
electron.ipcMain.handle("google:disconnectAccount", (_, email) => disconnectGoogleAccount(email));
electron.ipcMain.handle("google:sync", async () => {
  const n = await syncGoogleCalendar();
  await setSetting("google_last_sync", (/* @__PURE__ */ new Date()).toISOString());
  return n;
});
electron.ipcMain.handle("accounts:getAll", () => getAccounts$1());
electron.ipcMain.handle("accounts:create", (_, name, currency, balance) => createAccount(name, currency, balance));
electron.ipcMain.handle("accounts:update", (_, id, name, currency, balance) => updateAccount(id, name, currency, balance));
electron.ipcMain.handle("accounts:delete", (_, id) => deleteAccount(id));
electron.ipcMain.handle("categories:getAll", () => getCategories());
electron.ipcMain.handle("categories:create", (_, name, type, color) => createCategory(name, type, color));
electron.ipcMain.handle("categories:delete", (_, id) => deleteCategory(id));
electron.ipcMain.handle("transactions:getAll", (_, month) => getTransactions(month));
electron.ipcMain.handle(
  "transactions:create",
  (_, accountId, categoryId, amount, currency, type, description, date) => createTransaction(accountId, categoryId, amount, currency, type, description, date)
);
electron.ipcMain.handle(
  "transactions:update",
  (_, id, accountId, categoryId, amount, currency, type, description, date) => updateTransaction(id, accountId, categoryId, amount, currency, type, description, date)
);
electron.ipcMain.handle("transactions:delete", (_, id) => deleteTransaction(id));
electron.ipcMain.handle("transactions:bulk", (_, rows) => bulkInsertTransactions(rows));
electron.ipcMain.handle("budgets:getForMonth", (_, month) => getBudgets(month));
electron.ipcMain.handle("budgets:set", (_, categoryId, month, amount) => setBudget(categoryId, month, amount));
electron.ipcMain.handle("investments:getAll", () => getInvestments());
electron.ipcMain.handle("investments:history", () => getInvestmentHistory());
electron.ipcMain.handle("investments:create", (_, name, type, amount, currency) => createInvestment(name, type, amount, currency));
electron.ipcMain.handle("investments:setValue", (_, investmentId, month, amount) => setInvestmentValue(investmentId, month, amount));
electron.ipcMain.handle("investments:delete", (_, id) => deleteInvestment(id));
electron.ipcMain.handle("pluggy:sync", async () => {
  const r = await syncPluggy();
  await setSetting("pluggy_last_sync", (/* @__PURE__ */ new Date()).toISOString());
  return r;
});
electron.ipcMain.handle("pluggy:status", () => pluggyConfigured());
electron.ipcMain.handle("pluggy:connectToken", () => createConnectToken());
electron.ipcMain.handle("trips:getAll", () => getTrips());
electron.ipcMain.handle(
  "trips:create",
  (_, origin, destination, startDate, endDate, budget, currency, status) => createTrip(origin, destination, startDate, endDate, budget, currency, status)
);
electron.ipcMain.handle(
  "trips:update",
  (_, id, origin, destination, startDate, endDate, budget, currency, status) => updateTrip(id, origin, destination, startDate, endDate, budget, currency, status)
);
electron.ipcMain.handle("trips:delete", (_, id) => deleteTrip(id));
electron.ipcMain.handle("flights:getAll", () => getFlightWatches());
electron.ipcMain.handle(
  "flights:create",
  (_, tripId, origin, destination, price, currency) => createFlightWatch(tripId, origin, destination, price, currency, (/* @__PURE__ */ new Date()).toISOString())
);
electron.ipcMain.handle("flights:delete", (_, id) => deleteFlightWatch(id));
electron.ipcMain.handle("flights:search", async (_, origin, destination, currency, date) => {
  const r = await searchFlightPrice(origin, destination, currency, date);
  await setSetting("skyscanner_last_sync", (/* @__PURE__ */ new Date()).toISOString());
  return r;
});
electron.ipcMain.handle("flights:refreshWatch", async (_, id) => {
  const r = await refreshWatchPrice(id);
  await setSetting("skyscanner_last_sync", (/* @__PURE__ */ new Date()).toISOString());
  return r;
});
electron.ipcMain.handle("tripDocs:get", (_, tripId) => getTripDocuments(tripId));
electron.ipcMain.handle(
  "tripDocs:set",
  (_, tripId, item, checked) => setTripDocument(tripId, item, checked)
);
electron.ipcMain.handle("skills:getAll", () => getSkills());
electron.ipcMain.handle(
  "skills:create",
  (_, name, description, category, tags, content) => createSkill(name, description, category, tags, content)
);
electron.ipcMain.handle(
  "skills:update",
  (_, id, name, description, category, tags, content) => updateSkill(id, name, description, category, tags, content)
);
electron.ipcMain.handle("skills:delete", (_, id) => deleteSkill(id));
electron.ipcMain.handle("skills:toggleFavorite", (_, id) => toggleSkillFavorite(id));
electron.ipcMain.handle("agents:getAll", () => getAgents());
electron.ipcMain.handle(
  "agents:create",
  (_, name, description, role, systemPrompt, defaultSkillIds, tags) => createAgent(name, description, role, systemPrompt, defaultSkillIds, tags)
);
electron.ipcMain.handle(
  "agents:update",
  (_, id, name, description, role, systemPrompt, defaultSkillIds, tags) => updateAgent(id, name, description, role, systemPrompt, defaultSkillIds, tags)
);
electron.ipcMain.handle("agents:delete", (_, id) => deleteAgent(id));
electron.ipcMain.handle("agents:toggleFavorite", (_, id) => toggleAgentFavorite(id));
electron.ipcMain.handle("executions:getAll", () => getExecutions());
electron.ipcMain.handle(
  "executions:create",
  (_, agentId, skillIds, userPrompt, finalPrompt, response) => createExecution(agentId, skillIds, userPrompt, finalPrompt, response)
);
electron.ipcMain.handle("executions:delete", (_, id) => deleteExecution(id));
electron.ipcMain.handle("links:getAll", () => getLinks());
electron.ipcMain.handle("links:create", (_, title, url, tags) => createLink(title, url, tags));
electron.ipcMain.handle("links:update", (_, id, title, url, tags) => updateLink(id, title, url, tags));
electron.ipcMain.handle("links:setChecked", (_, id, checked) => setLinkChecked(id, checked));
electron.ipcMain.handle("links:markOpened", (_, id) => setLinkOpened(id));
electron.ipcMain.handle("links:delete", (_, id) => deleteLink(id));
electron.ipcMain.handle("study:topics", () => getStudyTopics());
electron.ipcMain.handle("study:createTopic", (_, name, category, status, targetDate, priority, color) => createStudyTopic(name, category, status, targetDate, priority, color));
electron.ipcMain.handle("study:updateTopic", (_, id, name, category, status, targetDate, priority, color) => updateStudyTopic(id, name, category, status, targetDate, priority, color));
electron.ipcMain.handle("study:deleteTopic", (_, id) => deleteStudyTopic(id));
electron.ipcMain.handle("study:nodes", (_, topicId) => getStudyNodes(topicId));
electron.ipcMain.handle("study:allNodes", () => getAllStudyNodes());
electron.ipcMain.handle("study:allNotes", () => getAllStudyNotes());
electron.ipcMain.handle("study:createNode", (_, topicId, parentId, title, description, estimatedHours) => createStudyNode(topicId, parentId, title, description, estimatedHours));
electron.ipcMain.handle("study:updateNode", (_, id, title, description, status, estimatedHours) => updateStudyNode(id, title, description, status, estimatedHours));
electron.ipcMain.handle("study:deleteNode", (_, id) => deleteStudyNode(id));
electron.ipcMain.handle("study:moveNode", (_, id, dir) => moveStudyNode(id, dir));
electron.ipcMain.handle("study:reorderNode", (_, id, newParentId, newIndex) => reorderStudyNode(id, newParentId, newIndex));
electron.ipcMain.handle("study:getNote", (_, topicId, nodeId) => getStudyNote(topicId, nodeId));
electron.ipcMain.handle("study:saveNote", (_, topicId, nodeId, content) => saveStudyNote(topicId, nodeId, content));
electron.ipcMain.handle("study:flashcards", (_, topicId) => getStudyFlashcards(topicId));
electron.ipcMain.handle("study:due", (_, nowISO) => getDueFlashcards(nowISO));
electron.ipcMain.handle("study:createFlashcard", (_, topicId, nodeId, front, back) => createStudyFlashcard(topicId, nodeId, front, back));
electron.ipcMain.handle("study:updateFlashcard", (_, id, front, back) => updateStudyFlashcard(id, front, back));
electron.ipcMain.handle("study:deleteFlashcard", (_, id) => deleteStudyFlashcard(id));
electron.ipcMain.handle("study:reviewFlashcard", (_, id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt) => reviewStudyFlashcard(id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt));
electron.ipcMain.handle("study:quizAttempts", (_, topicId) => getStudyQuizAttempts(topicId));
electron.ipcMain.handle("study:saveQuizAttempt", (_, topicId, score, total, durationMs) => createStudyQuizAttempt(topicId, score, total, durationMs));
function studySlug(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "topico";
}
function studyToMarkdown(bundle) {
  const lines = [`# ${bundle.topic.name}`, ""];
  const noteByNode = /* @__PURE__ */ new Map();
  for (const n of bundle.notes) noteByNode.set(n.nodeId, n.content);
  const childrenOf = (pid) => bundle.nodes.filter((x) => (x.parentId ?? null) === pid).sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const topicNote = noteByNode.get(null);
  if (topicNote && topicNote.trim()) lines.push(topicNote.trim(), "");
  const walk = (pid, level) => {
    for (const node of childrenOf(pid)) {
      const h = "#".repeat(Math.min(6, level + 1));
      lines.push(`${h} ${node.title}${node.status === "done" ? " ✓" : ""}`, "");
      if (node.description) lines.push(node.description, "");
      const note = noteByNode.get(node.id);
      if (note && note.trim()) lines.push(note.trim(), "");
      walk(node.id, level + 1);
    }
  };
  walk(null, 1);
  return lines.join("\n");
}
electron.ipcMain.handle("study:exportMarkdown", async (_, topicId) => {
  const bundle = await getStudyBundle(topicId);
  if (!bundle) return { ok: false };
  const result = await electron.dialog.showSaveDialog({
    title: "Exportar caderno",
    defaultPath: `${studySlug(bundle.topic.name)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.writeFileSync(result.filePath, studyToMarkdown(bundle));
  return { ok: true, message: `Caderno salvo em ${result.filePath}` };
});
electron.ipcMain.handle("study:exportJson", async (_, topicId) => {
  const bundle = await getStudyBundle(topicId);
  if (!bundle) return false;
  return exportJson(`${studySlug(bundle.topic.name)}.study.json`, bundle);
});
electron.ipcMain.handle("study:importJson", async () => {
  const bundle = await readJson();
  if (!bundle || !bundle.topic) return { ok: false };
  const topicId = await importStudyBundle(bundle);
  return { ok: true, topicId };
});
electron.ipcMain.handle("study:exportFolder", async (_, topicId) => {
  const bundle = await getStudyBundle(topicId);
  if (!bundle) return { ok: false };
  const result = await electron.dialog.showOpenDialog({
    title: "Escolha a pasta de destino",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  const root = path.join(result.filePaths[0], studySlug(bundle.topic.name));
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "roadmap.json"), JSON.stringify(bundle, null, 2));
  const noteByNode = /* @__PURE__ */ new Map();
  for (const n of bundle.notes) noteByNode.set(n.nodeId, n.content);
  for (const node of bundle.nodes) {
    const note = noteByNode.get(node.id) ?? "";
    const body = `# ${node.title}

${node.description ? node.description + "\n\n" : ""}${note}`;
    fs.writeFileSync(path.join(root, `${String(node.orderIndex).padStart(3, "0")}-${studySlug(node.title)}.md`), body);
  }
  return { ok: true, message: `Exportado para ${root}` };
});
electron.ipcMain.handle("study:importFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ title: "Escolha a pasta do tópico", properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  const roadmapPath = path.join(result.filePaths[0], "roadmap.json");
  if (!fs.existsSync(roadmapPath)) return { ok: false, error: "roadmap.json não encontrado na pasta." };
  try {
    const bundle = JSON.parse(fs.readFileSync(roadmapPath, "utf8"));
    const topicId = await importStudyBundle(bundle);
    return { ok: true, topicId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
async function exportJson(defaultName, data) {
  const result = await electron.dialog.showSaveDialog({
    title: "Exportar",
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
  return true;
}
async function readJson() {
  const result = await electron.dialog.showOpenDialog({
    title: "Importar",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
}
electron.ipcMain.handle("skills:export", async (_, id) => {
  const skill = (await getSkills()).find((s) => s.id === id);
  if (!skill) return false;
  return exportJson(`${skill.name}.skill.json`, skill);
});
electron.ipcMain.handle("skills:import", async () => {
  const obj = await readJson();
  if (!obj || !obj.name) return null;
  return importSkill(obj);
});
electron.ipcMain.handle("agents:export", async (_, id) => {
  const agent = (await getAgents()).find((a) => a.id === id);
  if (!agent) return false;
  return exportJson(`${agent.name}.agent.json`, agent);
});
electron.ipcMain.handle("agents:import", async () => {
  const obj = await readJson();
  if (!obj || !obj.name) return null;
  return importAgent(obj);
});
async function resolveClaudeCommand(projectId) {
  if (projectId != null) {
    const projects = await getProjects();
    const p = projects.find((x) => x.id === projectId);
    if (p?.claudeCommand && p.claudeCommand.trim()) return p.claudeCommand.trim();
  }
  return await getSetting("claude_command") || "claude";
}
async function resolveModel(model) {
  return (model || await getSetting("claude_model") || "").trim();
}
async function resolveProjectCwd(projectId) {
  if (projectId == null) return void 0;
  const p = (await getProjects()).find((x) => x.id === projectId);
  return p?.localPath && p.localPath.trim() ? p.localPath.trim() : void 0;
}
const DEFAULT_ALLOWED_TOOLS = "Bash(gh:*) Bash(git:*) Read Write Edit Glob Grep";
async function resolveAllowedToolsArgs() {
  const tools = (await getSetting("claude_allowed_tools") || DEFAULT_ALLOWED_TOOLS).trim();
  return tools ? ["--allowedTools", tools] : [];
}
function parseRepoSlug(url) {
  if (!url) return null;
  const m = url.trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}
async function buildProjectContext(projectId) {
  if (projectId == null) return "";
  const p = (await getProjects()).find((x) => x.id === projectId);
  if (!p) return "";
  const slug = parseRepoSlug(p.githubRepoUrl);
  const hasLocal = !!(p.localPath && p.localPath.trim() && fs.existsSync(p.localPath.trim()));
  const lines = ["### CONTEXTO DO PROJETO", `Projeto: ${p.name}`];
  if (p.description) lines.push(`Descrição: ${p.description}`);
  if (p.githubRepoUrl) lines.push(`Repositório GitHub: ${p.githubRepoUrl}`);
  if (hasLocal) {
    lines.push(
      `Diretório de trabalho: ${p.localPath.trim()} (você já está rodando DENTRO desta pasta do projeto).`,
      "Use o repositório desta pasta normalmente (git/gh sem --repo, pois o remote já é o do projeto)."
    );
  } else if (slug) {
    lines.push(
      `Repositório de destino para git/gh: ${slug}`,
      `IMPORTANTE: sempre use --repo ${slug} nos comandos gh (ex.: gh issue create --repo ${slug} ...).`,
      "NÃO use o remote da pasta atual — o diretório de trabalho é o app RickOS, não este projeto."
    );
  }
  return lines.join("\n") + "\n\n";
}
electron.ipcMain.handle("ai:run", async (_, prompt, projectId, model) => {
  return runClaude(prompt, await resolveClaudeCommand(projectId), { model: await resolveModel(model) });
});
const aiRuns = /* @__PURE__ */ new Map();
function broadcast(channel, payload) {
  for (const w of electron.BrowserWindow.getAllWindows()) if (!w.webContents.isDestroyed()) w.webContents.send(channel, payload);
}
electron.ipcMain.handle("ai:start", async (_, params) => {
  const runId = crypto.randomUUID();
  const run2 = { id: runId, status: "running", output: "", error: null };
  aiRuns.set(runId, run2);
  const command = await resolveClaudeCommand(params.projectId ?? void 0);
  const model = await resolveModel(params.model);
  const context = await buildProjectContext(params.projectId);
  const cwd = await resolveProjectCwd(params.projectId);
  const agentic = params.permission === "execute";
  const extraArgs = agentic ? [] : await resolveAllowedToolsArgs();
  runClaude(context + params.prompt, command, {
    model,
    extraArgs,
    // libera gh/git/arquivos para o Claude executar (ex.: criar issue)
    cwd,
    // roda dentro do diretório do projeto, quando configurado
    timeoutMs: 0,
    // sem timeout: tarefas podem demorar
    streamJson: !agentic,
    // texto/pensamento ao vivo (modo seguro)
    agentic,
    // 'executar': roda ferramentas de verdade (bidirecional)
    onChunk: (text) => {
      run2.output += text;
      broadcast("ai:chunk", { runId, text });
    },
    registerChild: (kill) => {
      run2.kill = kill;
    }
  }).then(async (result) => {
    run2.status = "done";
    run2.output = result;
    if (params.save !== false) {
      try {
        await createExecution(params.agentId ?? null, params.skillIds ?? "[]", params.userPrompt ?? "", params.prompt, result);
      } catch {
      }
    }
    broadcast("ai:done", { runId, ok: true, output: result, error: null });
  }).catch((e) => {
    const cancelled = run2.status === "cancelled";
    run2.status = cancelled ? "cancelled" : "error";
    run2.error = cancelled ? "Execução cancelada." : e instanceof Error ? e.message : String(e);
    broadcast("ai:done", { runId, ok: false, output: run2.output, error: run2.error });
  }).finally(() => {
    setTimeout(() => aiRuns.delete(runId), 10 * 60 * 1e3);
  });
  return runId;
});
electron.ipcMain.handle("ai:getRun", (_, runId) => {
  const r = aiRuns.get(runId);
  return r ? { status: r.status, output: r.output, error: r.error } : null;
});
electron.ipcMain.handle("ai:runStream", async (event, prompt, projectId, model, runId) => {
  const command = await resolveClaudeCommand(projectId);
  const context = await buildProjectContext(projectId);
  const extraArgs = await resolveAllowedToolsArgs();
  const cwd = await resolveProjectCwd(projectId);
  return runClaude(context + prompt, command, {
    model: await resolveModel(model),
    extraArgs,
    cwd,
    onChunk: (text) => {
      if (!event.sender.isDestroyed()) event.sender.send("ai:chunk", { runId, text });
    }
  });
});
electron.ipcMain.handle("ai:cancel", (_, runId) => {
  const r = aiRuns.get(runId);
  if (r?.kill) {
    r.status = "cancelled";
    r.kill();
    return true;
  }
  return false;
});
electron.ipcMain.handle("app:openExternal", (_, url) => electron.shell.openExternal(url));
electron.ipcMain.handle("app:exportDb", async () => {
  await getDb();
  saveDb();
  const dbPath2 = path.join(electron.app.getPath("userData"), "timetracker.db");
  const connected = await googleConnected();
  const buttons = connected ? ["Baixar localmente", "Google Drive", "Cancelar"] : ["Baixar localmente", "Cancelar"];
  const choice = await electron.dialog.showMessageBox({
    type: "question",
    message: "Exportar backup do banco",
    detail: connected ? "Escolha o destino do backup." : "Dica: conecte o Google em Configurações para habilitar o envio ao Drive.",
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1
  });
  const picked = buttons[choice.response];
  if (picked === "Baixar localmente") {
    const result = await electron.dialog.showSaveDialog({
      title: "Exportar banco",
      defaultPath: "timetracker_snapshot.sqlite",
      buttonLabel: "Exportar",
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.copyFileSync(dbPath2, result.filePath);
    return { ok: true, target: "local", message: `Backup salvo em ${result.filePath}` };
  }
  if (picked === "Google Drive") {
    try {
      const accounts = await listGoogleAccounts();
      let email = accounts[0];
      if (accounts.length > 1) {
        const accBtns = [...accounts, "Cancelar"];
        const pick = await electron.dialog.showMessageBox({
          type: "question",
          message: "Enviar para qual conta Google?",
          buttons: accBtns,
          defaultId: 0,
          cancelId: accBtns.length - 1
        });
        if (accBtns[pick.response] === "Cancelar") return { ok: false };
        email = accBtns[pick.response];
      }
      const now = /* @__PURE__ */ new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const fileName = `timetracker_snapshot_${stamp}.sqlite`;
      const r = await uploadFileToDrive(dbPath2, fileName, email);
      return { ok: true, target: "drive", message: `Enviado ao Google Drive (${r.account}): ${r.name}`, link: r.link };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false };
});
electron.ipcMain.handle("app:importDb", async (event) => {
  const result = await electron.dialog.showOpenDialog({
    title: "Import Database Snapshot",
    buttonLabel: "Import",
    filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return false;
  const dbPath2 = path.join(electron.app.getPath("userData"), "timetracker.db");
  closeDb();
  fs.copyFileSync(result.filePaths[0], dbPath2);
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  win?.webContents.reload();
  return true;
});
electron.ipcMain.handle("app:snapshots", () => listSnapshots());
electron.ipcMain.handle("app:restoreSnapshot", async (event, snapPath) => {
  const ok = restoreSnapshot(snapPath);
  if (ok) electron.BrowserWindow.fromWebContents(event.sender)?.webContents.reload();
  return ok;
});
