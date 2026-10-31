# GitHub Branching & Deployment Strategy

This repository utilizes a simplified Git Flow architecture designed for zero-downtime, automated deployments across **Vercel**, **Cloudflare Workers/Pages**, and **Docker**.

---

## 🌳 Branch Hierarchy

```
       (Feature)                 (Feature)
   feature/billing-update    feature/barcode-scanner
         \                         /
          \                       /
develop ───●─────────────────────●───────► Staging / Preview Builds (Vercel Preview)
            \                   /
             \                 /
main ─────────●───────────────●──────────► Production Release (Vercel Prod / Cloudflare)
```

### 1. `main` (Production Branch)
* **Status**: Always deployable, stable, fully tested.
* **Connected To**:
  * **Vercel Production**: Automatically deploys to your live production domain (e.g. `smart-kirana.vercel.app`).
  * **Cloudflare Workers / Pages**: Deploys to `smart-kirana.mparadkar671.workers.dev`.
* **Rules**: Never commit directly to `main` without review. Only merge from `develop` via Pull Request or fast-forward release merge.

### 2. `develop` (Integration & Staging Branch)
* **Status**: Active development branch.
* **Connected To**:
  * **Vercel Preview Deployments**: Every commit generates a unique Preview URL for testing before going live.
* **Rules**: Feature branches merge into `develop`. CI/CD runs all 43 tests on every push.

### 3. `feature/*` (Feature Branches)
* Used for new features, UI tweaks, or bug fixes.
* Branch from: `develop`
* Merge into: `develop`
* Example: `feature/whatsapp-templates`, `feature/dark-mode-icons`

---

## 🚀 How to Make and Deploy Changes

### Step 1: Create a feature branch
```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-new-feature
```

### Step 2: Make changes & test locally
```bash
npm test -- --run
npm run build
```

### Step 3: Commit and push
```bash
git add .
git commit -m "feat: description of changes"
git push origin feature/my-new-feature
```

### Step 4: Merge to `develop` (Preview Deployment)
Open a Pull Request on GitHub from `feature/my-new-feature` to `develop`.
* GitHub Actions will run tests automatically.
* Vercel will create a preview link to review the changes.

### Step 5: Release to `main` (Live Production Deployment)
When ready for production release:
```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```
Both Vercel and Cloudflare will automatically build and deploy to your live production website!

---

## 🐳 Docker Deployment (Optional Alternative)

If you wish to host on your own VPS, cloud server (AWS EC2, DigitalOcean, Linode), or local server:

### Run with Docker Compose
```bash
docker compose up -d --build
```
Your store POS will be running on `http://localhost:3005` with high-performance Nginx.

### Run with Docker CLI
```bash
docker build -t smart-kirana:latest .
docker run -d -p 3005:80 --name smart-kirana-pos smart-kirana:latest
```
