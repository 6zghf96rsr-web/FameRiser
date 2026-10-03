# FameRiser

FameRiser is a Czech creator ranking application. This repository contains the application, migrations, ranking contracts, and tests. The ranking pilot is under development. The public ranking API is not enabled in the deployed application.

## Local development

Use Node.js 22.

```sh
npm ci
cp .env.example .env
npm run demo:db
npm run dev
```

The default configuration runs a fictional demo with payments disabled. Never commit real credentials or personal data.

## Verification

```sh
npm run lint:baseline
npm run typecheck
npm run migrations:check
npm test
npm run build
npm run preview:smoke
```

The `Verify` GitHub Actions workflow runs these checks for pull requests and pushes to `main`. The public ranking endpoint requires separate privacy/legal approval and production integration before release.
