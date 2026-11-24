# Deploying to Google Cloud Run (staging, synthetic data)

Nothing in this repository deploys itself, and nothing here has been run against a real Google Cloud project. These are the steps for **you** to run, in order, with your own account. Use synthetic patients only. Every `PLACEHOLDER` is yours to fill in.

> **Read first.** This setup is for a **staging demo with fictional patients**. It is not a configuration for real patient data: see [What this is not](#what-this-is-not).

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Web app + API | One container on Cloud Run (`Dockerfile`) | Express serves the API and the built web app on `$PORT` (8080). |
| Database | SQLite in the container, copied continuously to a Cloud Storage bucket by [Litestream](https://litestream.io) | Survives restarts and new revisions. See the caveat below. |
| Pharmacist pill photos | A second Cloud Storage bucket, mounted at `/mnt/uploads` | Written once, never edited, so a bucket mount is safe for them. |
| Secrets | Secret Manager | Session secret, pharmacist passcode, model key. Never in the image or the YAML. |
| Model | Gemini or OpenAI over the internet | Optional. Without a key the chat says it cannot answer and forwards to the pharmacist. |

Health checks: `GET /healthz` (process is up) and `GET /readyz` (database readable). Neither needs sign-in or reveals configuration.

## Decisions for you before you start

1. **Storage.** Litestream keeps the code unchanged but has one real limit: **Cloud Run starts the new revision while the old one is still running** during a deploy. For those seconds two instances replicate to the same bucket path, and writes the old instance makes during the overlap can be lost. That is acceptable for synthetic data and **not** for real records. A real deployment should move to a managed database (Cloud SQL for PostgreSQL), which means porting `server/core/db.ts` and every query to an async driver. That work is not done.
2. **Cost.** One instance runs all the time (`minScale: 1`, CPU not throttled) so replication and the daily label refresh keep running. Expect a small continuous charge. Pick the region deliberately.
3. **Going public.** A new Cloud Run service is private. Patients and the iOS app need it publicly callable. That is step 9, after you have checked staging.
4. **Which model and key** (or none).

## Fast path (recommended): one script in Cloud Shell

Open [Cloud Shell](https://shell.cloud.google.com) (it is already signed in to your account), clone the repository, check out this branch, and run:

```bash
git clone https://github.com/elliebrolo/Take-Home-Pharmacist && cd Take-Home-Pharmacist
git checkout claude/festive-shannon-52jcx5
PROJECT_ID=your-project-id ./deploy/deploy-staging.sh
```

If the repository is private, Cloud Shell will ask for GitHub credentials when cloning (use a fine-grained read-only token, or `gh auth login`); do not paste a token into this repository or into a chat.

Optional settings: `REGION`, `MIN_INSTANCES=0` (cheaper, see [Costs](#costs)), and `GEMINI_MODEL=<a model your key can use>` (the script then asks for the key with hidden input; without it the app deploys with no model and the chat says it cannot answer).

The script does steps 1 to 8 below: it checks that billing is on, creates the private buckets, service account, secrets and image, deploys a **private** service, and runs `scripts/verify-deployment.mjs` against it. It asks before doing anything, is safe to run again (existing secrets are kept, never replaced), never prints a secret, and **never grants public access**. It was tested against a stand-in `gcloud` (`tests/deployScript.test.ts`), not against Google Cloud.

To check any deployment later, from a machine with Node 18+ and a clone of the repository:

```bash
THP_PASSCODE=$(gcloud secrets versions access latest --secret=thp-pharmacist-passcode) \
THP_IDENTITY_TOKEN=$(gcloud auth print-identity-token) \
node scripts/verify-deployment.mjs --url https://YOUR-SERVICE-URL
```

(`THP_IDENTITY_TOKEN` is only for a private service; leave it out once the service is public.) It runs 40 checks with fictional patients: health, security headers, anonymous access refused, pharmacist sign-in, QR code creation and single use, patient sign-in and plan, a patient refused pharmacist data, the emergency text for chest pain (including "no appetite and chest pain"), "should I stop" forwarded to the pharmacist, and the escalations appearing in the review queue. It leaves no unused access code behind.

## Steps

Set these once in your shell.

```bash
export PROJECT_ID=PLACEHOLDER
export REGION=us-central1          # choose deliberately
export SERVICE=take-home-pharmacist
export DB_BUCKET=${PROJECT_ID}-thp-db
export UPLOADS_BUCKET=${PROJECT_ID}-thp-uploads
export SA=take-home-pharmacist@${PROJECT_ID}.iam.gserviceaccount.com
gcloud config set project $PROJECT_ID
```

**1. Enable the services.**

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com
```

**2. Create the buckets** (private, no public access, versioning on the database copy).

```bash
gcloud storage buckets create gs://$DB_BUCKET --location=$REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$DB_BUCKET --versioning
gcloud storage buckets create gs://$UPLOADS_BUCKET --location=$REGION --uniform-bucket-level-access --public-access-prevention
```

**3. Create the service account with the least access it needs.**

```bash
gcloud iam service-accounts create take-home-pharmacist --display-name="Take-Home Pharmacist"
gcloud storage buckets add-iam-policy-binding gs://$DB_BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding gs://$UPLOADS_BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin
```

**4. Create the secrets.** The first two are generated, so no one ever types or sees them. The model key is read without echo.

```bash
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create thp-session-secret --data-file=-
openssl rand -base64 18 | tr -d '\n' | gcloud secrets create thp-pharmacist-passcode --data-file=-
read -rs -p "Gemini API key: " K; echo; printf %s "$K" | gcloud secrets create thp-gemini-api-key --data-file=-; unset K
for s in thp-session-secret thp-pharmacist-passcode thp-gemini-api-key; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

To read the generated pharmacist passcode when you need to sign in: `gcloud secrets versions access latest --secret=thp-pharmacist-passcode`. Skip the Gemini secret (and delete its block in `deploy/cloudrun.yaml`) to run without a model.

**5. Build the image** (Cloud Build uses the `Dockerfile`; your `.gitignore` keeps `.env*` and `data/` out).

```bash
gcloud artifacts repositories create take-home-pharmacist --repository-format=docker --location=$REGION
export TAG=$(git rev-parse --short HEAD)
gcloud builds submit --tag $REGION-docker.pkg.dev/$PROJECT_ID/take-home-pharmacist/app:$TAG .
```

**6. Fill in `deploy/cloudrun.yaml`.** Replace `PROJECT_ID`, `REGION`, `TAG`, `DB_BUCKET`, `UPLOADS_BUCKET`, `GEMINI_MODEL` (a model name your key can use: the defaults in this repo are unverified), and `PUBLIC_BASE_URL`. The service address is predictable:

```bash
echo "https://$SERVICE-$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)').$REGION.run.app"
```

**7. Deploy it (still private).**

```bash
gcloud run services replace deploy/cloudrun.yaml --region=$REGION
```

**8. Test it privately, including a real API call, not just the home page.**

```bash
URL=$(gcloud run services describe $SERVICE --region=$REGION --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token)
curl -fsS -H "Authorization: Bearer $TOKEN" $URL/readyz
curl -fsS -H "Authorization: Bearer $TOKEN" $URL/api/auth/patients      # synthetic names, only because DEMO_MODE=true
gcloud run services proxy $SERVICE --region=$REGION --port=8081          # then open http://localhost:8081
```

In the proxied page: sign in as the pharmacist, open a demo patient, **Create access code**, and sign in as that patient in a private window using the code. Check that the chat answers or says it cannot, and that an emergency phrase shows the 911 text. Restart the service (deploy again) and confirm the records are still there.

**9. Make it public: only after you have checked step 8 and approve it.**

```bash
gcloud run services add-iam-policy-binding $SERVICE --region=$REGION --member=allUsers --role=roles/run.invoker
```

Then open the HTTPS address **on a phone on mobile data** and repeat the sign-in with a QR code scanned from a laptop screen. To undo: `gcloud run services remove-iam-policy-binding … --member=allUsers …`.

## Costs

Estimates for one staging service in `us-central1`, **not a quote**. Prices change; confirm them on the [Cloud Run pricing page](https://cloud.google.com/run/pricing) and the [pricing calculator](https://cloud.google.com/products/calculator) before you rely on them. The figures below are Google's published on-demand rates as found in the build session.

| Item | Basis | Per month |
| --- | --- | --- |
| Cloud Run, always on (`MIN_INSTANCES=1`, the default) | 1 vCPU and 0.5 GiB for about 2.59 million seconds at $0.000018 per vCPU-second and $0.000002 per GiB-second; the free tier is 240,000 vCPU-seconds and 450,000 GiB-seconds | about **$44** with the free tier, about $49 without it |
| Cloud Run, scale to zero (`MIN_INSTANCES=0`) | billed only while handling requests | **a few dollars at most** for light demo use (not verified here) |
| Secret Manager | 3 secret versions; the first six are free | about $0 |
| Artifact Registry | one image under 0.5 GiB; first 0.5 GiB free | about $0 to $0.10 |
| Cloud Storage | two small buckets, a few MB; the 5 GB free tier is for some US regions | about $0, plus tiny operation charges from replication |
| Cloud Build | one build per deploy | within the free allowance for occasional builds (not verified here) |
| Gemini or OpenAI | per request | cents for a demo; set a budget alert on the key |

So plan on **about $45 to $50 a month while it is running**, or under about $5 if you choose scale to zero. Scale to zero has a real cost in reliability: replication only runs while the container does, so a stop without time to flush can lose the last writes, and the daily label refresh does not run. Use it for a throwaway demo, not for something people depend on.

To avoid surprise charges: create a [budget alert](https://console.cloud.google.com/billing/budgets) (for example $20), and when you finish, `gcloud run services delete $SERVICE --region=$REGION`, then delete the two buckets, the secrets and the Artifact Registry repository.

## Operating it

| Task | How |
| --- | --- |
| Logs | `gcloud run services logs read $SERVICE --region=$REGION` |
| New release | Build a new `TAG`, edit the image in the YAML, `replace` again. **Do it when nobody is using it** (overlap caveat above). |
| Restore the database | `litestream restore -o ./app.db gcs://$DB_BUCKET/take-home-pharmacist` (needs `gcloud auth application-default login`). The bucket is versioned. |
| Rotate a secret | `gcloud secrets versions add thp-session-secret --data-file=-`, then redeploy. Rotating the session secret signs everyone out. |
| Stop spending | `gcloud run services delete $SERVICE --region=$REGION`; delete the buckets and secrets separately. |

## Configuration reference

All variables are in `.env.example`. Production-specific behaviour:

- `NODE_ENV=production` (set by the image): the server **refuses to start** without `SESSION_SECRET` (32+ characters) and `PHARMACIST_PASSCODE` (12+ characters), turns on HSTS and a Content-Security-Policy, and trusts one proxy hop so the sign-in rate limit sees real client addresses.
- `DEMO_MODE`: off in production unless you set `true`. When off, the sign-in page does not list patients and the demo patients are not created.
- The entrypoint refuses to start without `LITESTREAM_REPLICA_URL` unless `ALLOW_EPHEMERAL_DB=true`.
- Patient sessions last `PATIENT_SESSION_HOURS` (default 24). An access code works once, so a patient who signs out, or whose session expires, needs a new code from the pharmacy. Choose the length with that in mind.

## What this is not

Staging with synthetic data only. Before any real patient data:

- Real authentication (an identity provider, MFA, per-person pharmacist accounts) instead of a shared passcode and single-use codes.
- A managed database and encryption/key management you control, and a tested backup and restore.
- A business associate agreement with Google and the model provider, privacy review (HIPAA/PHIPA), and a medical-device determination.
- A monitored on-call path for urgent queue items (the webhook is only an announcement).
- Clinician review of every fixed text, the triage lists and the evaluation set.

## Not verified in the build session

No Docker daemon or Google Cloud project was available, so the image was **not built** and `gcloud` was **not run**. What was run: the production server from a clean `npm ci --omit=dev` install, the entrypoint logic against a stand-in `litestream`, and the browser flows under the production Content-Security-Policy. CI builds the image and checks its health endpoints on every push; look at that job first. Litestream's real restore and replicate against Cloud Storage, the bucket volume mount and the secret references are untested until you deploy.
