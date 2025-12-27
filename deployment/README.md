# Deployment Configuration

This directory contains infrastructure and deployment configuration files.

## Files

- `Dockerfile`: Multi-stage build for production, serving built assets via a Node.js Express proxy.
- `nginx.conf`: Example Nginx configuration for reverse proxying (if not using the Express server).
- `deploy.ps1`: PowerShell script for deploying to Google Cloud Run.

## Cloud Run Deployment

To deploy to Google Cloud Run using the provided script:

1. Ensure you have Google Cloud SDK and Docker installed.
2. Authenticate: `gcloud auth login` and `gcloud auth configure-docker`.
3. Run the deployment script:
   ```powershell
   ./deployment/deploy.ps1 -ProjectId your-project-id
   ```

The script will build the Docker image, push it to GCR, and deploy to Cloud Run.
