export const SCHEMA = `
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
    claudeCommand TEXT
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
