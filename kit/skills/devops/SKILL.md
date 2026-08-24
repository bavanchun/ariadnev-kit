---
name: av:devops
description: "Use when deploying or operating Cloudflare, Docker, GCP, Kubernetes, CI/CD, GitOps, containers, serverless infrastructure, or platform security controls."
user-invocable: true
when_to_use: "Invoke for cloud, containers, Kubernetes, CI/CD, or GitOps."
category: infrastructure
keywords: [cloudflare, docker, gcp, kubernetes, cicd]
license: MIT
argument-hint: "[platform] [task]"
metadata:
  origin: ported
  author: upstream
  version: "2.0.0"
---

# DevOps Skill

Deploy and manage cloud infrastructure across Cloudflare, Docker, Google Cloud, and Kubernetes.

## When to Use

- Deploy serverless apps to Cloudflare Workers/Pages
- Containerize apps with Docker, Docker Compose
- Manage GCP with gcloud CLI (Cloud Run, GKE, Cloud SQL)
- Kubernetes cluster management (kubectl, Helm)
- GitOps workflows (Argo CD, Flux)
- CI/CD pipelines, multi-region deployments
- Security audits, RBAC, network policies

## Platform Selection

| Need | Choose |
|------|--------|
| Sub-50ms latency globally | Cloudflare Workers |
| Large file storage (zero egress) | Cloudflare R2 |
| SQL database (global reads) | Cloudflare D1 |
| Containerized workloads | Docker + Cloud Run/GKE |
| Enterprise Kubernetes | GKE |
| Managed relational DB | Cloud SQL |
| Static site + API | Cloudflare Pages |
| Container orchestration | Kubernetes |
| Package management for K8s | Helm |

## Preflight

```bash
wrangler --version
docker version
gcloud version
kubectl version --client
helm version
```

Run only checks relevant to the selected platform. Inspect account, project,
cluster, namespace, region, and current config before any mutation. Preview or
diff changes where supported, then obtain explicit approval for the resolved
production target before deploy, apply, push, or traffic-shift commands.

## References

### Cloudflare Platform
- `references/cloudflare-platform.md` — Edge computing model, architecture patterns, wrangler CLI essentials
- `references/cloudflare-workers-basics.md` — Handler types (fetch/scheduled/queue/email), routing, bindings, deployment
- `references/cloudflare-workers-advanced.md` — Session reuse, multi-tier caching, WebSockets, code splitting, performance tuning
- `references/cloudflare-workers-apis.md` — Runtime APIs (fetch, HTMLRewriter, WebSockets, Web Crypto, bindings reference)
- `references/cloudflare-r2-storage.md` — Object storage: S3 API integration, multipart uploads, lifecycle rules, migration
- `references/cloudflare-d1-kv.md` — D1 SQLite and KV store setup, usage patterns, and decision matrix
- `references/browser-rendering.md` — Puppeteer/Playwright automation: screenshots, PDFs, session reuse, crawling

### Docker
- `references/docker-basics.md` — Dockerfile patterns, image building, container/volume/network management
- `references/docker-compose.md` — Multi-container orchestration, environment-specific configs, health checks

### Google Cloud
- `references/gcloud-platform.md` — gcloud CLI install, authentication, configuration management, CI/CD integration
- `references/gcloud-services.md` — Compute Engine, GKE, Cloud Run, App Engine, Cloud SQL, BigQuery commands

### Kubernetes
Use upstream Kubernetes and Helm documentation for cluster-specific details.

### Scripts
- `scripts/cloudflare_deploy.py` - Automate Worker deployments
- `scripts/docker_optimize.py` - Analyze Dockerfiles

## Best Practices

**Security:** Non-root containers, RBAC, secrets in env vars, image scanning
**Performance:** Multi-stage builds, edge caching, resource limits
**Cost:** R2 for large egress, caching, right-size resources
**Development:** Docker Compose local dev, wrangler dev, version control IaC

## Resources

- Cloudflare: https://developers.cloudflare.com
- Docker: https://docs.docker.com
- GCP: https://cloud.google.com/docs
- Kubernetes: https://kubernetes.io/docs
- Helm: https://helm.sh/docs

## Output format

Return target account/project/cluster and region/namespace, current state, files
changed, proposed command or pipeline, preview/diff evidence, verification and
rollback steps, and any production action still awaiting approval.

## Quality gates

- [ ] Target identity and environment were resolved before mutation.
- [ ] Secrets use an approved secret path and were not printed.
- [ ] IaC/config changes are reviewable, least-privileged, and rollback-ready.
- [ ] Images are pinned/scanned and workloads define health/resource controls.
- [ ] A preview, diff, dry run, or staging check ran where available.
- [ ] No deploy, apply, traffic shift, or destructive action occurred without
      explicit authorization for the exact target.

## Workflow position

**Typically follows:** `av:plan` and a tested application artifact.

**Typically precedes:** `av:deploy` when it owns the final release, or platform
smoke checks and monitoring after an authorized change.

**Related:** `av:backend-development` for service code and `av:security` for
threat-model review of infrastructure boundaries.
