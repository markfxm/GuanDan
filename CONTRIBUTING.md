# Contributing

This project is developed through GitHub issues, branches, and pull requests.

## First-time setup

```powershell
git clone https://github.com/markfxm/GuanDan.git
cd GuanDan
npm install
```

## Run locally

On Windows, double-click:

```text
start-guandan.cmd
```

Or run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-guandan.ps1
```

Open:

```text
http://127.0.0.1:5173/
```

## Development commands

Run the API and frontend separately:

```powershell
npm run api
```

```powershell
npm run dev
```

Run checks before opening a pull request:

```powershell
npm test
npm run build
```

## Branch workflow

Do not work directly on `main`.

Create a branch for each change:

```powershell
git checkout main
git pull
git checkout -b feature/short-description
```

Commit and push:

```powershell
git add .
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Then open a pull request into `main`.

## Pull request expectations

- Keep each PR focused on one feature, fix, or cleanup.
- Explain what changed and why.
- Include screenshots for UI changes when useful.
- Make sure `npm test` and `npm run build` pass locally.
- Wait for GitHub Actions CI to pass before merging.

## Code notes

- Frontend code lives in `src/ui`.
- Game state and rules live in `src/game`.
- Card and planning logic live in `src/engine`.
- API routes live in `src/server`.
- Tests live in `tests`.
