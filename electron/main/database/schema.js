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
    endTime TEXT
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
    archived INTEGER NOT NULL DEFAULT 0
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
    currency TEXT NOT NULL DEFAULT 'JPY',
    lastChecked TEXT
  );

  -- ── RickOS: Settings & integrações ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS github_issues (
    id INTEGER PRIMARY KEY,          -- GitHub's global issue id
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,             -- open | closed
    repo TEXT NOT NULL,              -- owner/name
    url TEXT,
    labels TEXT,                     -- JSON array of label names
    milestone TEXT,
    updatedAt TEXT
  );
`;
