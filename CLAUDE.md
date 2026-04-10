# CLAUDE.md

You are a senior full-stack engineer. Your task is to generate a COMPLETE, WORKING desktop application — not a demo.

This project MUST run locally without errors.

---

# 🎯 PROJECT: Local-First Desktop Time Tracking App

A personal productivity tool that tracks everything I do during the day, with both manual and automatic tracking.

This is a REAL app for daily usage.

---

# ⚙️ TECH STACK (MANDATORY)

* Electron (desktop app)
* React + TypeScript (frontend)
* Vite (build tool)
* SQLite (local database)
* Zustand (state management)

DO NOT change the stack.

---

# 🚨 CRITICAL REQUIREMENTS

* The app MUST run locally with:

  * `npm install`
  * `npm run dev`

* No missing dependencies

* No pseudo-code

* No placeholders like “implement this later”

* No broken imports

Everything must be functional.

---

# 🧠 CORE CONCEPT

This app is a **continuous timeline of the day**:

* The user is always doing something
* There must be NO time gaps
* If a task stops, another must start automatically (idle/break)

---

# 📱 FEATURES (ALL REQUIRED)

## 1. Active Task System

* Only ONE active task at a time

* Task fields:

  * id
  * title
  * tagId
  * startTime
  * endTime (nullable if active)

* Controls:

  * start task
  * stop task
  * switch task instantly

* Must include a visible running timer

---

## 2. Daily Timeline View

* Vertical timeline from 00:00 to 23:59

* Tasks displayed as blocks

* Blocks must:

  * have correct height based on duration
  * be draggable (change time)
  * be resizable (adjust duration)

* No overlapping tasks allowed

---

## 3. Calendar View

* Monthly grid

* Each day shows:

  * total tracked hours

* Include basic heatmap coloring (more hours = stronger color)

---

## 4. Tags System

* Create, edit, delete tags
* Each tag:

  * id
  * name
  * color
  * isProductive (boolean)

---

## 5. Smart Logic (MANDATORY)

* If a task stops → automatically start "Idle"
* If there is a time gap → auto-fill with "Idle"
* If two consecutive tasks have same title + tag → merge them

---

## 6. Statistics Dashboard

* Total hours:

  * daily
  * weekly
  * monthly

* Hours grouped by tag

* Use simple charts (no heavy libraries)

---

## ⌨️ UX REQUIREMENTS

* Fast interactions (minimal clicks)

* Include keyboard shortcuts:

  * Start/stop task
  * Quick switch tasks

* Include quick-start buttons for frequent tasks

---

# 🧱 DATABASE (SQLITE)

You MUST implement a working SQLite database.

Provide:

* schema
* initialization
* CRUD functions

---

# 🧩 ARCHITECTURE

You MUST structure the project like a real app:

* electron/
* src/

  * components/
  * pages/
  * store/
  * services/
  * database/

Separate:

* UI logic
* business logic
* database logic

---

# 📦 OUTPUT FORMAT (STRICT)

You MUST output:

1. Full project folder structure
2. All files with code (no omissions)
3. Clear file paths before each file
4. Valid code only

Example:

/src/main.ts

```ts
// code here
```

---

# 🚀 IMPLEMENTATION ORDER

Follow this order:

1. Project setup (Electron + Vite + React)
2. SQLite setup
3. State management (Zustand)
4. Task logic (start/stop/switch)
5. Timeline UI
6. Calendar UI
7. Dashboard

---

# 🚫 DO NOT

* Do NOT skip steps
* Do NOT simplify features
* Do NOT give explanations instead of code

---

# ✅ FINAL GOAL

When I paste your output into a project and run:

npm install
npm run dev

The app MUST open and be usable.

---

Start now.
