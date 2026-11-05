# Pipework Site Safety

Safety portal for Pipework Ltd: jobs with a daily site diary for each one, operatives and training matrix, toolbox talks, job RAMS and sign-off.
Built and supported by Safety Simplified Ltd.

Hosted on Railway (Node.js, PostgreSQL). Variables: `DATABASE_URL`, `MASTER_EMAIL`, `MASTER_PASSWORD`, `TRESOR_KEY`, `TRESOR_URL`, `NODE_ENV=production`, optional `PUBLIC_URL`.

## Site diaries

Each job has a diary link (`/d/TOKEN`). The supervisor opens it on their phone at the end of the day, fills in the diary (labour, plant, work done, deliveries, visitors, delays, instructions received, health and safety, photos), signs it and sends it. The office sees every diary under Site diaries, can download any day as a PDF, and can export a date range for a job as one PDF.
