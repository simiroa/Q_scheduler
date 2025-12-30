# Architecture

## Overview
Quantum Scheduler is a browser-first app served by a lightweight Python HTTP server. The frontend is static HTML/CSS/JS, and the backend provides simple JSON APIs for project storage. Most logic (rendering, interactions, state) runs in the browser.

## Frontend
- Entry: `server/index.html` loads `server/script.js` as an ES module.
- Core class: `Scheduler` in `server/scheduler/core.js`.
- Feature modules (prototype mixins):
  - Persistence: `server/scheduler/persistence.js`
  - Data helpers: `server/scheduler/data.js`
  - Rendering: `server/scheduler/render.js`
  - Interactions: `server/scheduler/interactions.js`
  - UI/menus/modals: `server/scheduler/ui.js`
- The app is instantiated on `DOMContentLoaded` in `server/script.js`.

## Backend
- Server: `server/server.py` (built on `http.server`).
- Port: `8088`.
- Static files served from the `server/` directory.
- API endpoints:
  - `GET /api/health` health check
  - `GET /api/projects` list projects
  - `GET /api/project/:name` load project
  - `POST /api/project/:name` save project
  - `DELETE /api/project/:name` delete project
  - `PUT /api/project/:name` rename project
  - `GET /api/schedule` legacy schedule load
  - `POST /api/schedule` legacy schedule save

## Data Storage
- Projects are stored as JSON files in `server/list/`.
- Legacy schedule file: `server/schedule.json` (backup at `server/schedule.json.bak`).
- Browser File System Access API is used when available for local export/import.

## Run
- Windows launcher: `server/start_server.bat` detects Python, installs if missing, starts the server, and opens the browser.
- URL: `http://localhost:8088`.
