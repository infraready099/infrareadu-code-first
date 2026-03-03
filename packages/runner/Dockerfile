# InfraReady Deploy Runner
# Lambda container image — includes Node.js 20 runtime + OpenTofu binary.
# Build context must be the repo root so the modules directory is accessible.
#
# Build:  docker build -f packages/runner/Dockerfile -t infraready-runner .
# Push:   docker tag infraready-runner <ecr-url>:latest && docker push <ecr-url>:latest

FROM public.ecr.aws/lambda/nodejs:20

# ── Install OpenTofu ──────────────────────────────────────────────────────────
# Download the official release, install to /opt/opentofu/tofu.
# Version pinned for reproducibility — update here + in CI when upgrading.
ARG TOFU_VERSION=1.9.0

RUN yum install -y wget unzip tar gzip && \
    wget -q "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_amd64.zip" \
         -O /tmp/tofu.zip && \
    mkdir -p /opt/opentofu && \
    unzip -q /tmp/tofu.zip tofu -d /opt/opentofu && \
    chmod +x /opt/opentofu/tofu && \
    rm /tmp/tofu.zip && \
    # Smoke-test: confirm the binary runs
    /opt/opentofu/tofu version

# ── Copy OpenTofu modules ─────────────────────────────────────────────────────
# All 11 modules are bundled into the image at /var/task/modules/.
# The runner's MODULES_PATH env var points here.
COPY packages/modules/ /var/task/modules/

# ── Copy built runner ─────────────────────────────────────────────────────────
# Build the runner first: cd packages/runner && npm run build
# This produces packages/runner/dist/index.js (esbuild bundle).
COPY packages/runner/dist/index.js ${LAMBDA_TASK_ROOT}/index.js

# ── Lambda handler ────────────────────────────────────────────────────────────
CMD ["index.handler"]
