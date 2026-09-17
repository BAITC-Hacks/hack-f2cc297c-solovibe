#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
revision=${1:?Expected the validated full Git SHA}
root=${2:-/opt/solovibe-rehearsal}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid revision" >&2; exit 1; }
[[ "$root" =~ ^/[a-zA-Z0-9_/-]+$ && "$root" != / && "$root" != *..* ]] || { echo "Invalid deployment directory" >&2; exit 1; }
[[ -f "$root/runtime.env" ]] || { echo "Provision runtime.env first" >&2; exit 1; }
exec 9>"$root/deploy.lock"
flock -w 1800 9 || { echo "Another release holds the deployment lock" >&2; exit 1; }
archive="$root/incoming/$revision.tar"
[[ -f "$archive" ]] || { echo "Missing validated source archive: $revision" >&2; exit 1; }
export APP_REVISION="$revision"
mkdir -p "$root/releases"
release=$(mktemp -d "$root/releases/$revision.XXXXXXXX")
tar -xf "$archive" -C "$release"
compose() { docker compose --project-name solovibe-rehearsal --env-file "$root/runtime.env" -f "$release/compose.production.yaml" "$@"; }
compose config --quiet
compose build app
compose up -d --wait --wait-timeout 120 db
# A migration failure exits before replacing the running app.
compose run -T --rm --no-deps migrate
previous=$(readlink -f "$root/current" 2>/dev/null || true)
rollback_compatible=false
if tr -d '\r' < "$root/runtime.env" | grep -x 'APP_ROLLBACK_COMPATIBLE=1' > /dev/null; then rollback_compatible=true; fi
replacing=false
recover() {
  code=$?
  trap - ERR
  if [[ "$replacing" == true && "$rollback_compatible" == true && -n "$previous" && -f "$previous/revision" ]]; then
    echo "Release failed; attempting to restore the previous application (database migrations remain)." >&2
    APP_REVISION=$(cat "$previous/revision") docker compose --project-name solovibe-rehearsal --env-file "$root/runtime.env" -f "$previous/compose.production.yaml" up -d --no-deps --no-build --wait --wait-timeout 120 app || echo "Rollback failed; inspect the server immediately." >&2
  elif [[ "$replacing" == true ]]; then
    echo "Release failed; automatic rollback requires APP_ROLLBACK_COMPATIBLE=1 and a previous successful release. Inspect the server." >&2
  fi
  exit "$code"
}
trap recover ERR
replacing=true
compose up -d --no-deps --no-build --wait --wait-timeout 120 app
compose exec -T app node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r=>{const h=await r.json();if(!r.ok||h.status!=="ok"||h.revision!==process.env.APP_REVISION)process.exit(1)}).catch(()=>process.exit(1))'
printf '%s\n' "$revision" > "$release/revision"
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
replacing=false
trap - ERR
echo "Healthy application release: $revision"
