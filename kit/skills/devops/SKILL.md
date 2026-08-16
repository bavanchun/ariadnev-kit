---
name: av:devops
description: Deploy to Cloudflare (Workers, R2, D1), Docker, GCP (Cloud Run, GKE), Kubernetes (kubectl, Helm). Use for serverless, containers, CI/CD, GitOps, security audit.
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

## Quick Start

```bash
# Cloudflare Worker
wrangler init my-worker && cd my-worker && wrangler deploy

# Docker
docker build -t myapp . && docker run -p 3000:3000 myapp

# GCP Cloud Run
gcloud run deploy my-service --image gcr.io/project/image --region us-central1

# Kubernetes
kubectl apply -f manifests/ && kubectl get pods
```

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
