#!/usr/bin/env bash
# Builds and optionally publishes a tested image from a CI runner.
set -Eeuo pipefail
umask 077
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
app=${1:?Use: bash ci/cloud-build.sh roko|bridge [test|publish]}
mode=${2:-test}
[[ "$app" == roko || "$app" == bridge ]] || exit 2
[[ "$mode" == test || "$mode" == publish ]] || exit 2
rm -f ci-result.json ci-result.json.tmp
if [[ "$mode" == publish ]]; then
  [[ "${CI_BRANCH:-}" == main ]] || { echo 'Only main may publish a deployment image.' >&2; exit 1; }
  repository=$(python3 "$script_dir/registry-manifest.py" repository "$app")
  registry=${repository%%/*}
  : "${CI_REGISTRY_PUSH_USER:?Set the registry username in the publishing environment}"
  : "${CI_REGISTRY_PUSH_TOKEN:?Set the registry token in the publishing environment}"
  push_user=$CI_REGISTRY_PUSH_USER
  push_token=$CI_REGISTRY_PUSH_TOKEN
fi
bash "$script_dir/build.sh" "$app"
if [[ "$mode" == test ]]; then
  rm -f ci-result.json
  exit 0
fi
manifest=$(python3 "$script_dir/manifest.py" read "$app")
mapfile -t fields <<< "$manifest"
image=${fields[0]}; image_id=${fields[1]}
rm -f ci-result.json
registry_config=$(mktemp -d)
export DOCKER_CONFIG="$registry_config"
function cleanup_registry() { rm -rf "$registry_config"; }
trap cleanup_registry EXIT
printf '%s' "$push_token" |
  docker login "$registry" --username "$push_user" --password-stdin >/dev/null
remote_tag="${repository}:${CI_COMMIT_SHA}-${CI_BUILD_NUMBER}"
docker tag "$image" "$remote_tag"
docker push "$remote_tag"
# Docker Hub may normalize away docker.io; the manifest helper checks this alias.
docker image inspect --format '{{json .RepoDigests}}' "$remote_tag" |
  python3 "$script_dir/registry-manifest.py" publish "$app" "$image_id" > ci-result.json.tmp
mv ci-result.json.tmp ci-result.json
printf 'CI tests/build and registry publication completed for %s.\n' "$app"
