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
- Port: chosen at startup. The server starts from the `PORT` environment variable (default `8088`) and tries each port up to `PORT + 9` until one binds. The port it actually bound to is written to `server/server_port.txt` so the tray app can find it.
- Static files served from the `server/` directory.
- API endpoints:
  - `GET /api/projects` list projects
  - `DELETE /api/projects` delete all projects
  - `GET /api/project/:name` load project
  - `POST /api/project/:name` save project
  - `PUT /api/project/:name` rename project
  - `DELETE /api/project/:name` delete project

## Data Storage
- Projects are stored as JSON files in `server/list/`.
- Legacy schedule file: `server/schedule.json`, kept only for migration and for the "delete all" cleanup path.
- Export/import happens in the Settings modal ("아카이브 백업"): export serializes the schedule to a JSON blob and triggers a browser download (`schedule_<date>.json`), import reads a picked file with `FileReader`.

## Run
- Directly: `python server/server.py`. It serves the app and prints the local and network URLs.
- Via the tray app: `python tray_app.py` (or the packaged `QuantumScheduler.exe`). It starts the server as a child process, waits briefly, then opens the browser. The tray menu offers open page, copy network address, network info, start/stop server, and quit. It reads the live port from `server/server_port.txt`, falling back to `8088`.
- URL: `http://localhost:<port>` — `8088` unless that port was taken.
