# JARVIS Acceptance Test Plan

**Objective:** Define an evidence-based, runtime-verified acceptance test suite for JARVIS to prove its capability as a generic, cross-platform autonomous software engineering orchestrator.

**Rule:** Every test mandates REAL execution evidence. Source code inspection, mock data, or simulated PASS results are strictly prohibited.

---

## A. Android Application Target

**Prompt:** *"Build a simple task tracker Android application. It must allow users to add a text task to a local Room database, view a list of tasks, and mark a task as completed. It must include UI tests using Espresso."*

### Acceptance Criteria & Verification Evidence

1. **Toolchain & Build Execution:**
   - **Check:** Clean build of the APK.
   - **Evidence:** `gradlew assembleDebug` exit code 0. Valid `.apk` artifact output with SHA-256 checksum matching JARVIS report.
2. **Automated Testing:**
   - **Check:** Unit and Instrumentation tests pass.
   - **Evidence:** `gradlew connectedAndroidTest` execution log. Parsed XML output indicating 100% pass rate.
3. **Runtime Execution & UI Interaction:**
   - **Check:** App launches on an emulator/device and responds to input.
   - **Evidence:** ADB `uiautomator dump` verifying the presence of the "Add Task" button. ADB `input text` and `input tap` logs showing a task being added.
4. **Database State Verification:**
   - **Check:** The task was persisted to the Room database.
   - **Evidence:** Execution of `adb shell run-as <package> sqlite3` or pulling the database file to verify the row insertion.
5. **Mock Detection:**
   - **Check:** The data must not be hardcoded in the Compose views.
   - **Evidence:** Relaunching the app via ADB and verifying the previously added task persists and renders via `uiautomator dump`.

---

## B. Web Application Target

**Prompt:** *"Build a React/Vite single-page application for a weather dashboard. It must accept a city name via an input field, fetch the current weather using a public API mock/stub (or real open API), and display the temperature. Use Tailwind for styling."*

### Acceptance Criteria & Verification Evidence

1. **Toolchain & Build Execution:**
   - **Check:** Clean compilation of the static bundle.
   - **Evidence:** `npm run build` exit code 0. Presence of `index.html` and bundled JS/CSS in the `dist/` directory.
2. **Automated Testing:**
   - **Check:** Component tests pass.
   - **Evidence:** `npm run test` exit code 0 using Vitest/Jest, with the raw stdout log attached.
3. **Runtime Execution & UI Interaction:**
   - **Check:** The web app runs and is interactive.
   - **Evidence:** Execution of a headless browser script (e.g., Playwright or Puppeteer) that starts the local dev server (`npm run dev`), navigates to `localhost`, inputs a city name, clicks submit, and captures a screenshot of the resulting temperature display.
4. **Network/API Verification:**
   - **Check:** The app actually performs an HTTP request to fetch weather data, rather than showing hardcoded UI state.
   - **Evidence:** Network trace logs from the Playwright/Puppeteer script showing the outgoing `fetch()` or `XHR` request and its successful 200 response.
5. **Mock Detection:**
   - **Check:** The UI must reflect dynamic data.
   - **Evidence:** The headless script runs twice with two different city names and asserts that the resulting temperature or display data differs in the DOM.

---

## C. Backend/API Application Target

**Prompt:** *"Build a Node.js/Express REST API with SQLite. It must provide a POST /users endpoint to create a user (name, email) and a GET /users endpoint to retrieve all users. Include input validation."*

### Acceptance Criteria & Verification Evidence

1. **Toolchain & Build Execution:**
   - **Check:** Clean installation of dependencies and successful startup.
   - **Evidence:** `npm install` exit code 0.
2. **Automated Testing:**
   - **Check:** API integration tests pass.
   - **Evidence:** `npm run test` (using Supertest/Mocha) exit code 0 with parsed stdout output.
3. **Runtime Execution & API Interaction:**
   - **Check:** The server starts locally and binds to a port.
   - **Evidence:** A background task running `npm start`. A `curl` or `fetch` script executed against `http://localhost:<port>/health` returning status 200.
4. **Database State Verification & Mock Detection:**
   - **Check:** The endpoints perform actual read/writes rather than returning static arrays.
   - **Evidence:** 
     1. Execute a `curl -X POST` to create "TestUser".
     2. Verify the HTTP 201 response.
     3. Kill the Node process.
     4. Restart the Node process (`npm start`).
     5. Execute a `curl -X GET` and assert that "TestUser" is still returned.
     6. Direct SQLite inspection of the database file confirming the row exists.
5. **Security Verification:**
   - **Check:** Input validation functions correctly.
   - **Evidence:** Execute a `curl -X POST` with an invalid payload (e.g., missing email) and assert an HTTP 400 response with appropriate validation error JSON.
