# CI build, publication and deployment

The scripts in [ci/](ci/) provide a provider-neutral build and deployment flow.
Connect them to the CI service of your choice; this repository does not prescribe
a hosted pipeline configuration.

## Flow

1. Run `bash ci/cloud-build.sh roko test` on changes. The Docker build compiles the
   application and runs the selected tests in [ci/test.sh](ci/test.sh).
2. On `main`, run `bash ci/cloud-build.sh roko publish` with registry credentials.
   The command publishes the tested image by tag and records its immutable digest
   and image ID in `ci-result.json`.
3. On the deployment host, run `bash ci/deploy.sh roko` with the same commit,
   build number and manifest available. The host pulls and verifies the tested
   image, then updates the Compose service with health checks and rollback.

The CI environment must set `CI_COMMIT_SHA` to the full checked-out commit,
`CI_BUILD_NUMBER` to a positive integer unique to that run, and `CI_BRANCH` to the
branch name. The checkout must match the commit. For image publication, configure
`CI_IMAGE_REPOSITORY` as `registry/namespace/image` without tag or digest, plus
`CI_REGISTRY_PUSH_USER` and `CI_REGISTRY_PUSH_TOKEN` as protected secrets.

The deployment host also needs `ROKO_DEPLOY_DIR`, Docker, Compose, Bash, Python 3,
`flock`, registry pull credentials, and the matching `ci-result.json`. Set
`CI_HEALTH_ATTEMPTS` to change the optional health-check attempt count (default
60). Keep the manifest as a CI artifact between publication and deployment; it
contains identifiers only and is validated before use.

## Deployment contract

Automatic deployment is limited to `main`. It verifies the checkout, service,
build, digest, image ID and revision label, and skips an older run that has been
superseded. It pulls a `linux/amd64` image that has already passed the build; it
does not rebuild or rerun tests on the production host.

The directory in `ROKO_DEPLOY_DIR` contains the private `.env` and operational
Compose files, including `runtime-config.yaml`. Compose snapshots and image
overrides live in `.ci-deploy/releases/`; the project name is preserved during
bootstrap. The scripts use the host Docker daemon at `/var/run/docker.sock`.

Only `api` is updated. The health check verifies the expected image and `/health`
with attempts three seconds apart. It does not validate conversations,
permissions or document fidelity. If an update fails, the script attempts to
restore the previous version and retains its image and state for rollback.

## Manual operations

With `ROKO_DEPLOY_DIR` configured and an initial CI deployment:

```sh
bash ci/compose.sh roko ps
bash ci/compose.sh roko logs --tail=100 api
bash ci/deploy.sh roko rollback
```

For a local build and deployment, see [DEPLOY.md](DEPLOY.md). The reduced CI test
selection does not run every suite listed in [TESTS.md](TESTS.md).
