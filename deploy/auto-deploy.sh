#!/usr/bin/env bash
# Poll the origin for new commits on the deploy branch and redeploy when they
# appear. Intended to run periodically from a systemd timer or cron.
#
# A home server usually has no inbound access, so GitHub cannot call it — the
# server checks GitHub instead. Nothing is exposed, and no credentials leave
# the machine.
#
#   REPO_DIR       repository to deploy (default: this script's parent)
#   DEPLOY_BRANCH  branch to track (default: main)
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$REPO_DIR"

# One deploy at a time: a slow build must not overlap the next timer tick.
exec 9>"${TMPDIR:-/tmp}/shoplist-deploy.lock"
if ! flock -n 9; then
  echo "A deploy is already running; skipping this check."
  exit 0
fi

# Refuse to act if the checkout isn't on the deploy branch — better to stop
# than to fast-forward someone's work-in-progress out from under them.
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$BRANCH" ]; then
  echo "Repository is on '$current_branch', expected '$BRANCH'. Not deploying."
  exit 1
fi

git fetch --quiet origin "$BRANCH"

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/${BRANCH}")"

if [ "$local_sha" = "$remote_sha" ]; then
  exit 0 # already up to date; stay quiet so the logs only show real deploys
fi

echo "New commits on ${BRANCH}: ${local_sha:0:7} -> ${remote_sha:0:7}"

# --ff-only fails rather than creating a merge commit if the checkout has
# diverged or has uncommitted changes in tracked files.
git merge --ff-only "origin/${BRANCH}"

# Rebuilds only the layers that actually changed; unchanged deps stay cached.
docker compose up -d --build

# Reclaim space from the images this build superseded — worth doing on a small
# disk, and only ever removes untagged layers.
docker image prune -f >/dev/null

echo "Deployed ${remote_sha:0:7}."
