#!/usr/bin/env bash
# Deploys a STAGING demo (fictional patients only) to Google Cloud Run. Run it in Cloud Shell, or anywhere `gcloud`
# is signed in to the account that owns the project. It automates steps 1 to 8 of docs/deployment.md.
#
#   PROJECT_ID=my-project ./deploy/deploy-staging.sh
#
# Settings (environment variables)
#   PROJECT_ID      required. Billing must already be enabled on it.
#   REGION          default us-central1
#   SERVICE         default take-home-pharmacist
#   MIN_INSTANCES   default 1 (always on, about US$50/month). 0 = scale to zero (about US$0-5/month) with weaker
#                   guarantees: see docs/deployment.md "Costs".
#   GEMINI_MODEL    a model name your key can use. With it, the script asks for the Gemini key (hidden input).
#                   Leave unset to deploy WITHOUT a model: the chat then says it cannot answer and forwards to a pharmacist.
#   TAG             image tag, default the git short hash
#   ASSUME_YES=1    do not ask for confirmation
#   SKIP_VERIFY=1   do not run scripts/verify-deployment.mjs at the end
#   RENDERED_YAML_OUT=path   keep the filled-in service YAML there
#
# It NEVER makes the service public. Secrets are generated or read without echo and are never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PROJECT_ID:?Set PROJECT_ID, for example: PROJECT_ID=my-project ./deploy/deploy-staging.sh}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-take-home-pharmacist}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
DB_BUCKET="${DB_BUCKET:-${PROJECT_ID}-thp-db}"
UPLOADS_BUCKET="${UPLOADS_BUCKET:-${PROJECT_ID}-thp-uploads}"
SA_NAME="take-home-pharmacist"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="take-home-pharmacist"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:${TAG}"
case "$MIN_INSTANCES" in 0|1) ;; *) echo "MIN_INSTANCES must be 0 or 1 (SQLite allows one instance)." >&2; exit 2;; esac

gc() { echo "+ gcloud $*" >&2; gcloud "$@"; }          # shows what runs; secret values only ever go through stdin
exists() { gcloud "$@" >/dev/null 2>&1; }
say() { printf '\n== %s\n' "$*"; }

cat <<MSG
This will create or update, in project "$PROJECT_ID" (region $REGION):
  - APIs: Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud Storage
  - two PRIVATE buckets ($DB_BUCKET, $UPLOADS_BUCKET) and a service account with access to only those
  - three secrets (session secret, pharmacist passcode, optional model key), readable only by that service account
  - a Docker repository, and an image built by Cloud Build from this checkout (tag $TAG)
  - Cloud Build permission for the project's default build account (roles/cloudbuild.builds.builder)
  - the Cloud Run service "$SERVICE", PRIVATE (nobody can call it without your credentials), min instances $MIN_INSTANCES
It does not make anything public. It costs money: see docs/deployment.md "Costs".
MSG
if [ "${ASSUME_YES:-}" != "1" ]; then read -r -p "Continue? [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ] || { echo "Stopped."; exit 1; }; fi

gc config set project "$PROJECT_ID" >/dev/null

say "Checking billing"
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)" != "True" ]; then
  echo "Billing is not enabled on $PROJECT_ID (or you cannot see it). Enable it at https://console.cloud.google.com/billing and run this again." >&2
  exit 1
fi
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

say "1. Enabling services"
gc services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com

say "2. Buckets (private; database copy is versioned)"
for b in "$DB_BUCKET" "$UPLOADS_BUCKET"; do
  exists storage buckets describe "gs://$b" || gc storage buckets create "gs://$b" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
done
gc storage buckets update "gs://$DB_BUCKET" --versioning

say "3. Service account (least access)"
exists iam service-accounts describe "$SA" || gc iam service-accounts create "$SA_NAME" --display-name="Take-Home Pharmacist"
for b in "$DB_BUCKET" "$UPLOADS_BUCKET"; do
  gc storage buckets add-iam-policy-binding "gs://$b" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
done

say "4. Secrets"
make_secret() {   # name, generator command; creates only if missing, so re-running never changes a secret
  local name="$1"; shift
  if exists secrets describe "$name"; then echo "  $name already exists (kept)"; else "$@" | gcloud secrets create "$name" --data-file=- >/dev/null; echo "  $name created"; fi
}
make_secret thp-session-secret sh -c "openssl rand -base64 48 | tr -d '\n'"
make_secret thp-pharmacist-passcode sh -c "openssl rand -base64 18 | tr -d '\n'"
USE_GEMINI=0
if [ -n "${GEMINI_MODEL:-}" ]; then
  USE_GEMINI=1
  if ! exists secrets describe thp-gemini-api-key; then
    read -rs -p "Gemini API key (hidden): " K; echo
    [ -n "$K" ] || { echo "No key entered; stopping." >&2; exit 1; }
    printf %s "$K" | gcloud secrets create thp-gemini-api-key --data-file=- >/dev/null; unset K; echo "  thp-gemini-api-key created"
  else echo "  thp-gemini-api-key already exists (kept)"; fi
else
  echo "  GEMINI_MODEL not set: deploying without a model (chat will say it cannot answer)."
fi
for s in thp-session-secret thp-pharmacist-passcode $([ "$USE_GEMINI" = 1 ] && echo thp-gemini-api-key); do
  gc secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
done

say "5. Building the image with Cloud Build"
exists artifacts repositories describe "$REPO" --location="$REGION" || gc artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"
gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/cloudbuild.builds.builder --condition=None >/dev/null
gc builds submit --tag "$IMAGE" .

say "6. Filling in deploy/cloudrun.yaml (the file in the repository is not changed)"
URL_GUESS="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
RENDERED="$(mktemp)"; trap 'rm -f "$RENDERED"' EXIT
sed -e "s|name: take-home-pharmacist$|name: ${SERVICE}|" \
    -e "s|PROJECT_ID|${PROJECT_ID}|g" -e "s|REGION-docker|${REGION}-docker|" -e "s|:TAG|:${TAG}|" \
    -e "s|UPLOADS_BUCKET|${UPLOADS_BUCKET}|" -e "s|DB_BUCKET|${DB_BUCKET}|" \
    -e "s|https://SERVICE_URL_WITHOUT_TRAILING_SLASH|${URL_GUESS}|" \
    -e "s|SET_A_MODEL_YOUR_KEY_CAN_USE|${GEMINI_MODEL:-unused}|" deploy/cloudrun.yaml > "$RENDERED"
if [ "$USE_GEMINI" != 1 ]; then sed -i '/# BEGIN gemini/,/# END gemini/d' "$RENDERED"; fi
if [ "$MIN_INSTANCES" = 0 ]; then
  sed -i -e 's|autoscaling.knative.dev/minScale: "1"|autoscaling.knative.dev/minScale: "0"|' -e 's|run.googleapis.com/cpu-throttling: "false"|run.googleapis.com/cpu-throttling: "true"|' "$RENDERED"
fi
# Anything still looking like a template placeholder (outside comments) means a value was missed: do not deploy.
if grep -v '^[[:space:]]*#' "$RENDERED" | grep -nE 'PLACEHOLDER|SERVICE_URL_WITHOUT|SET_A_MODEL|PROJECT_ID|DB_BUCKET|UPLOADS_BUCKET|REGION-docker|:TAG$'; then
  echo "A placeholder was left in the service definition (shown above). Stopping before deploying." >&2; exit 1
fi
[ -z "${RENDERED_YAML_OUT:-}" ] || cp "$RENDERED" "$RENDERED_YAML_OUT"

say "7. Deploying (still private)"
gc run services replace "$RENDERED" --region="$REGION"
URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo "Service address: $URL"
if [ "$URL" != "$URL_GUESS" ]; then
  echo "NOTE: the real address differs from the one used for PUBLIC_BASE_URL ($URL_GUESS). QR links will use the wrong host until you set PUBLIC_BASE_URL=$URL (gcloud run services update $SERVICE --region=$REGION --update-env-vars PUBLIC_BASE_URL=$URL)." >&2
fi

say "8. Verifying the HTTPS endpoint (private: using your identity token)"
if [ "${SKIP_VERIFY:-}" = "1" ] || ! command -v node >/dev/null 2>&1; then
  echo "Skipped. Run it yourself:"
  echo "  THP_PASSCODE=\$(gcloud secrets versions access latest --secret=thp-pharmacist-passcode) THP_IDENTITY_TOKEN=\$(gcloud auth print-identity-token) node scripts/verify-deployment.mjs --url $URL"
else
  THP_PASSCODE="$(gcloud secrets versions access latest --secret=thp-pharmacist-passcode)" \
  THP_IDENTITY_TOKEN="$(gcloud auth print-identity-token)" \
  node scripts/verify-deployment.mjs --url "$URL"
fi

cat <<DONE

Done. The service is PRIVATE.
  Address:  $URL
  Passcode: gcloud secrets versions access latest --secret=thp-pharmacist-passcode
  Browse:   gcloud run services proxy $SERVICE --region=$REGION --port=8081   (then open http://localhost:8081)
  Public:   only when you decide: gcloud run services add-iam-policy-binding $SERVICE --region=$REGION --member=allUsers --role=roles/run.invoker
DONE
