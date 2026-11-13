@echo off
rem Flame in Freefall - one-click start (Windows).
rem Builds anything that is missing, then serves the site at http://localhost:8000
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo [1/4] Creating the Python environment...
  python -m venv backend\.venv || goto :fail
  backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt || goto :fail
)

if not exist "data\raw\manifest.json" (
  echo [2/4] Downloading the NASA PSI records ^(a few minutes^)...
  backend\.venv\Scripts\python.exe -X utf8 backend\ingest\fetch_psi.py || goto :fail
)

if not exist "data\flame.db" (
  echo [3/4] Building the database...
  backend\.venv\Scripts\python.exe -X utf8 backend\ingest\build_db.py || goto :fail
)

rem Optional: NASA reports and science documents for the AI assistant (about 130 MB, a few minutes).
rem Without them the assistant still works from the PSI records and run tables.
if not exist "data\docs.db" (
  echo [extra] Downloading and reading the NASA reports for the AI assistant...
  backend\.venv\Scripts\python.exe -X utf8 backend\ingest\fetch_docs.py && backend\.venv\Scripts\python.exe -X utf8 backend\ingest\build_docs.py
)
rem The other official NASA resources for the challenge: Combustion Science page and fact sheets, Researcher's
rem Guide, ScienceCast captions, Apollo 1, Apollo 13, Mir, Spinoff articles (about 9 MB, under a minute).
if not exist "data\resources.json" (
  echo [extra] Downloading and reading the official NASA resources...
  backend\.venv\Scripts\python.exe -X utf8 backend\ingest\fetch_resources.py && backend\.venv\Scripts\python.exe -X utf8 backend\ingest\build_resources.py
)
if exist "data\docs.db" if not exist "data\embeddings.npz" (
  echo [extra] Preparing meaning-based search ^(runs on this computer, takes several minutes^)...
  backend\.venv\Scripts\python.exe -X utf8 backend\ingest\build_embeddings.py
)

if not exist "frontend\dist\index.html" (
  echo [4/4] Building the website...
  pushd frontend
  if not exist node_modules call npm install --no-audit --no-fund || goto :fail
  call npm run build || goto :fail
  popd
)

echo.
echo  Flame in Freefall is starting at http://localhost:8000
echo  Press Ctrl+C in this window to stop it.
echo.
start "" http://localhost:8000
backend\.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --app-dir backend --port 8000
goto :eof

:fail
echo.
echo Something went wrong in the step above. See README.md for manual steps.
pause
exit /b 1
