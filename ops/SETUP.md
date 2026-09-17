# Rehearsal delivery

The rehearsal repository deploys `main` to the assigned server after GitHub installs dependencies, runs `pnpm check`, builds the application and validates the release scripts. CI archives the exact successful Git SHA, uploads it over SSH and asks the server to build that source. No application image registry or server-side Git credential is involved.

## Fixed environment

- Repository: `https://github.com/BAITC-Hacks/hack-f2cc297c-solovibe.git`
- Public origin: `https://104.207.93.242`
- SSH: `root@104.207.93.242:22022`
- Deployment root: `/opt/solovibe-rehearsal`
- Loopback application port: `127.0.0.1:3000`
- Compose project: `solovibe-rehearsal`

The server already has Docker, modern Docker Compose, Nginx, Certbot, a dedicated CI SSH public key and `/opt/solovibe-rehearsal/runtime.env`. The IP certificate is short-lived and renewed by the active `certbot.timer`. Nginx terminates HTTPS and proxies the direct IPv4 origin to the loopback application with response buffering disabled for streaming.

## GitHub configuration

Repository variables:

- `SSH_HOST=104.207.93.242`
- `SSH_USER=root`
- `SSH_PORT=22022`
- `SSH_DEPLOY_ROOT=/opt/solovibe-rehearsal`

Repository secrets:

- `SSH_PRIVATE_KEY`: the complete dedicated `ci-deploy-rehearsal` private key.
- `SSH_KNOWN_HOSTS`: `[104.207.93.242]:22022` followed by the verified ED25519 host key.

The workflow fails visibly when required SSH configuration is absent. Never print either secret in CI logs or store it in the repository.

## Server runtime

`/opt/solovibe-rehearsal/runtime.env` is mode 600 and persists outside releases. It contains generated PostgreSQL and Better Auth secrets, `APP_URL=https://104.207.93.242`, `APP_PORT=3000`, and any runtime provider/storage credentials the selected product actually needs. Local `.env` changes are not synchronized automatically.

Production Compose uses persistent PostgreSQL and file volumes, does not publish the database, and exposes the app only on loopback. `COMPOSIO_API_KEY` is optional and should remain empty unless the approved case needs connected accounts. The OpenAI key is added at hackathon time and loaded by recreating the app.

Changing `POSTGRES_PASSWORD` after the database volume is initialized does not change the existing database role password. Preserve `BETTER_AUTH_SECRET` while existing sessions should remain valid. Use additive migrations when a rollback to the preceding application may be needed.

## Release behavior

`scripts/deploy-ssh.sh` serializes releases with a server lock, extracts the validated archive into a new release directory, validates Compose, builds the app image, starts PostgreSQL, runs migrations, replaces the app and checks `/api/health` including the exact revision. The `current` symlink moves only after the healthy revision is running.

A build or migration failure leaves the previous app running. A replacement failure restores the previous app only when `APP_ROLLBACK_COMPATIBLE=1` is explicitly present and the previous release is available; database migrations are never reversed automatically. Do not delete production volumes or the migration ledger to recover a failed release.

Inspect a deployment with the GitHub Actions run, `/opt/solovibe-rehearsal/current/revision`, `docker compose ... ps`, application logs and `https://104.207.93.242/api/health`. A successful local or CI build alone does not prove that the server revision is live.

## Local commands

Use Node 22.22.3 or newer and pnpm 10.32.1:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Production configuration can be checked without exposing resolved secrets:

```sh
APP_REVISION=0000000000000000000000000000000000000000 docker compose --env-file /opt/solovibe-rehearsal/runtime.env -f compose.production.yaml config --quiet
```
