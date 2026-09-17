#!/usr/bin/env bash
# Exercises archive delivery and release boundaries without a server, Git credentials or Docker daemon.
set -euo pipefail
script="$(pwd)/scripts/deploy-ssh.sh"
testroot=$(mktemp -d /tmp/solovibedeployXXXXXXXX)
cleanup() {
  resolved=$(realpath "$testroot")
  [[ "$resolved" == "$(realpath /tmp)"/solovibedeploy* ]] || return 1
  rm -rf -- "$resolved"
}
trap cleanup EXIT
mkdir -p "$testroot/bin" "$testroot/fixture"
printf 'services: {}\n' > "$testroot/fixture/compose.production.yaml"
export FIXTURE="$testroot/fixture"
export EXPECTED_SHA=0123456789012345678901234567890123456789
cat > "$testroot/bin/git" <<'MOCK'
#!/usr/bin/env bash
# A server deployment must never need Git or GitHub credentials.
exit 99
MOCK
cat > "$testroot/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s revision=%s\n' "$*" "$APP_REVISION" >> "$CALLS"
[[ "$*" == 'compose --project-name solovibe-rehearsal '* ]] || exit 98
case "$*" in
  *'build app'*) [[ "$FAIL_AT" != build ]] ;;
  *'run -T --rm --no-deps migrate'*) [[ "$FAIL_AT" != migrate ]] ;;
  *'exec -T app node -e'*) [[ "$FAIL_AT" != health ]] ;;
  *'up -d --no-deps --no-build'*'app'*)
    if [[ "$FAIL_AT" == replace && ! -f "$MARKER" ]]; then touch "$MARKER"; exit 1; fi ;;
esac
MOCK
cat > "$testroot/bin/flock" <<'MOCK'
#!/usr/bin/env bash
[[ "$FAIL_AT" != lock ]]
MOCK
chmod +x "$testroot/bin/"*
export PATH="$testroot/bin:$PATH"
for scenario in build migrate replace rollback rollback_crlf missing_archive corrupt_archive lock success health; do
  root="$testroot/$scenario"
  mkdir -p "$root/incoming" "$root/releases/previous"
  cp "$FIXTURE/compose.production.yaml" "$root/releases/previous/compose.production.yaml"
  echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa > "$root/releases/previous/revision"
  ln -s "$root/releases/previous" "$root/current"
  [[ -L "$root/current" ]]
  : > "$root/runtime.env"
  tar -cf "$root/incoming/$EXPECTED_SHA.tar" -C "$FIXTURE" compose.production.yaml
  export CALLS="$root/calls" MARKER="$root/marker" FAIL_AT="$scenario"
  if [[ "$scenario" == rollback || "$scenario" == rollback_crlf ]]; then
    echo APP_ROLLBACK_COMPATIBLE=1 > "$root/runtime.env"
    if [[ "$scenario" == rollback_crlf ]]; then printf 'APP_ROLLBACK_COMPATIBLE=1\r\n' > "$root/runtime.env"; fi
    export FAIL_AT=replace
  elif [[ "$scenario" == missing_archive ]]; then
    mv "$root/incoming/$EXPECTED_SHA.tar" "$root/incoming/$EXPECTED_SHA.tar.tmp"
  elif [[ "$scenario" == corrupt_archive ]]; then
    printf 'incomplete upload' > "$root/incoming/$EXPECTED_SHA.tar"
  fi
  result=0
  bash "$script" "$EXPECTED_SHA" "$root" > "$root/output" 2>&1 || result=$?
  if [[ "$scenario" == success ]]; then
    [[ "$result" == 0 && -L "$root/current" ]]
    [[ "$(cat "$root/current/revision")" == "$EXPECTED_SHA" ]]
    [[ "$(readlink -f "$root/current")" == "$root/releases/$EXPECTED_SHA."* ]]
    grep -q 'exec -T app node -e' "$CALLS"
    grep -q 'h.revision!==process.env.APP_REVISION' "$CALLS"
    [[ "$(grep -c "revision=$EXPECTED_SHA" "$CALLS")" == 6 ]]
  elif [[ "$scenario" == missing_archive || "$scenario" == corrupt_archive || "$scenario" == lock ]]; then
    [[ "$result" != 0 && ! -f "$CALLS" ]]
  else
    [[ "$result" != 0 ]]
    app_calls=$(grep -c 'up -d --no-deps --no-build.*app' "$CALLS" || true)
    case "$scenario" in
      build|migrate) [[ "$app_calls" == 0 ]] ;;
      replace|health) [[ "$app_calls" == 1 ]] ;;
      rollback|rollback_crlf)
        [[ "$app_calls" == 2 ]]
        grep -q 'revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$CALLS" ;;
    esac
  fi
  if [[ "$scenario" != success ]]; then
    [[ "$(readlink -f "$root/current")" == "$root/releases/previous" ]]
    [[ "$(cat "$root/current/revision")" == aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ]]
  fi
  if [[ "$scenario" == health ]]; then grep -q 'exec -T app node -e' "$CALLS"; fi
  echo "PASS: $scenario"
done
if bash "$script" invalid "$testroot" >/dev/null 2>&1; then exit 1; fi
echo 'PASS: invalid SHA rejected'

# Execute the actual CI delivery block with fake Git/SSH/SCP, so stale checks and
# transport failures cannot regress independently of the workflow.
awk '/^        run: \|$/ { block=1; next } block { sub(/^          /, ""); print }' .github/workflows/ci.yml > "$testroot/delivery.sh"
bash -n "$testroot/delivery.sh"
cat > "$testroot/bin/git" <<'MOCK'
#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$CALLS"
case "$1" in
  archive)
    [[ "$4" == "$EXPECTED_SHA" ]] || exit 98
    tar -cf "${3#--output=}" -C "$FIXTURE" compose.production.yaml ;;
  ls-remote)
    [[ "$FAIL_AT" != remote ]] || exit 1
    printf '%s\trefs/heads/main\n' "${FETCH_SHA:-$EXPECTED_SHA}" ;;
  *) exit 99 ;;
esac
MOCK
cat > "$testroot/bin/ssh" <<'MOCK'
#!/usr/bin/env bash
printf 'ssh %s\n' "$*" >> "$CALLS"
[[ "$FAIL_AT" != ssh ]]
MOCK
cat > "$testroot/bin/scp" <<'MOCK'
#!/usr/bin/env bash
printf 'scp %s\n' "$*" >> "$CALLS"
[[ "$FAIL_AT" != scp ]]
MOCK
chmod +x "$testroot/bin/"*
export SSH_HOST=example.test SSH_USER=deploy SSH_PORT=22022 DEPLOY_ROOT=/opt/solovibe-rehearsal
export SSH_PRIVATE_KEY=mock-key SSH_KNOWN_HOSTS=mock-host GITHUB_SHA="$EXPECTED_SHA"
export GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1
for scenario in superseded remote ssh scp missing_config success; do
  export CALLS="$testroot/delivery-$scenario.calls" FAIL_AT="$scenario"
  unset FETCH_SHA
  export SSH_HOST=example.test
  if [[ "$scenario" == superseded ]]; then export FETCH_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; fi
  if [[ "$scenario" == missing_config ]]; then export SSH_HOST=; fi
  result=0
  bash "$testroot/delivery.sh" > "$testroot/delivery-$scenario.output" 2>&1 || result=$?
  case "$scenario" in
    superseded)
      [[ "$result" == 0 ]]
      ! grep -Eq '^(ssh|scp) ' "$CALLS" ;;
    remote)
      [[ "$result" != 0 ]]
      ! grep -Eq '^(ssh|scp) ' "$CALLS" ;;
    missing_config) [[ "$result" != 0 && ! -f "$CALLS" ]] ;;
    ssh|scp)
      [[ "$result" != 0 ]]
      ! grep -q 'bash -s --' "$CALLS" ;;
    success)
      [[ "$result" == 0 ]]
      [[ "$(grep -c '^ssh ' "$CALLS")" == 2 ]]
      [[ "$(grep -c '^scp ' "$CALLS")" == 1 ]]
      grep -q -- '-P 22022' "$CALLS"
      grep -q "mv -f $DEPLOY_ROOT/incoming/$GITHUB_SHA.123.1.tar.tmp $DEPLOY_ROOT/incoming/$GITHUB_SHA.tar && bash -s -- $GITHUB_SHA $DEPLOY_ROOT" "$CALLS" ;;
  esac
  echo "PASS: delivery $scenario"
done
