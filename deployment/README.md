# Deployment Configuration

This directory contains infrastructure and deployment configuration files.

## Files

- `Dockerfile`: Multi-stage build for production. It builds the React frontend and serves it via a Node.js Express proxy (`scripts/server.js`).
- `nginx.conf`: Example Nginx configuration for reverse proxying (alternative to the Express server).
- `deploy.ps1`: PowerShell script for automated deployment to Google Cloud Run.

## Important: Build Context

The `Dockerfile` is located in this directory, but it **must be built from the project root**. This is because the build process needs access to `package.json`, `src/`, and other root-level directories.

### Local Build Command
For local testing, you can use any tag:
```bash
docker build -t gemini-swarm -f deployment/Dockerfile .
```

### Build for Google Cloud (Manual)
To push to Artifact Registry, the tag must follow the full path format:
```bash
docker build -t europe-west1-docker.pkg.dev/your-project-id/cloud-run-source-deploy/gemini-swarm -f deployment/Dockerfile .
```

### .dockerignore
The [`.dockerignore`](../.dockerignore) file **must remain in the project root**. Docker looks for it in the build context root (the `.` in the command above). Moving it to this directory will cause it to be ignored, leading to bloated images containing `node_modules` and other unnecessary files.

## Cloud Run Deployment

### Automated Deployment (Cloud Build)
If you are using Google Cloud Build triggers, ensure the **Dockerfile path** in your trigger configuration is set to:
`deployment/Dockerfile`

The **Build context** (or "Included files") should remain as the repository root.

### Manual Deployment via Script
To deploy to Google Cloud Run using the provided PowerShell script:

1. Ensure you have Google Cloud SDK and Docker installed.
2. Authenticate: `gcloud auth login` and `gcloud auth configure-docker`.
3. Run the deployment script (can be run from any directory):
   ```powershell
   ./deployment/deploy.ps1 -ProjectId your-project-id
   ```

The script automatically detects the project root and the `Dockerfile` location, ensuring the correct build context is used regardless of your current working directory.
