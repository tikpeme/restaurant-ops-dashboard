# Restaurant Operations Dashboard

A serverless dashboard for a 12-location restaurant group. Managers submit an end-of-night report once and can edit it for 24 hours. Owners and investors see every location. Low revenue triggers an email alert.

**Live demo:** https://main.d2el5wphqyojln.amplifyapp.com/ (sign-in is limited to approved test users)

<!-- Add: architecture diagram and 2-3 screenshots (manager form, owner dashboard, alert email) -->

## Client scenario

| Requirement                                                               | How it's met                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 12 locations now, 4 more in 18 months, possible Canada expansion          | Pay-per-request DynamoDB and Lambda scale with no capacity planning. Location IDs are data, not infrastructure. |
| Managers submit once, edit within 24 hours                                | Atomic conditional update in Lambda (see Security)                                                              |
| Owner sees all locations, investor read-only, managers see only their own | Cognito groups + `custom:locationId`, enforced in Lambda                                                        |
| Sign in with Google                                                       | Cognito federated identity provider                                                                             |
| Alert when revenue is low                                                 | Lambda publishes to EventBridge, a rule sends email via SNS                                                     |
| Keep data indefinitely, recent data fast                                  | Tiering plan below (partly built)                                                                               |

## Architecture

```
Browser (Next.js on Amplify)
   │  Google sign-in via Cognito hosted UI → JWT
   ▼
API Gateway (Cognito authorizer validates the JWT)
   ▼
Lambda (Node 24, TypeScript)  ── role and location checks ──►  DynamoDB (reports)
   │
   └─ revenue < target ─► EventBridge ─► rule ─► SNS ─► owner email
```

Five CDK stacks (TypeScript):

| Stack           | Contents                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DatabaseStack` | DynamoDB table (partition key `locationId`, sort key `reportDate`, pay-per-request, point-in-time recovery), GSI `reportDate-locationId-index` for the owner's all-locations view, Streams enabled |
| `ArchiveStack`  | Versioned, encrypted S3 bucket with a lifecycle rule moving objects to Glacier after 2 years                                                                                                       |
| `AuthStack`     | Cognito user pool, Google identity provider, app client, groups `Owners` / `Managers` / `Investors`, custom attribute `locationId`                                                                 |
| `AlertsStack`   | SNS topic, EventBridge rule, email subscription, readable message template                                                                                                                         |
| `ApiStack`      | REST API, Cognito authorizer, single Lambda bundled with esbuild, CORS on gateway-generated errors                                                                                                 |

The frontend (`frontend/`) is Next.js (App Router) with Tailwind, hosted on AWS Amplify and built from this monorepo. The Lambda is in `backend/`.

## Key design decisions

**One Lambda for all routes.** At this scale, one function is simpler to deploy and reason about. The cost is a larger blast radius per deploy. Splitting per route is the next step if routes diverge in permissions or load.

**Access control lives in the Lambda, not just the UI.** The React pages redirect by role, but that only affects what users see. The Lambda reads identity from the token API Gateway already verified and enforces every rule, so a user calling the API directly gets the same limits.

**Groups for role, a custom attribute for location.** A group says what you can do. `custom:locationId` says which location a manager is tied to. The app client's `writeAttributes` leaves the attribute out, so a manager cannot reassign themselves.

**EventBridge between the Lambda and email.** The Lambda only announces "low revenue happened". Rules decide who hears about it, so adding a Slack target or a new alert type needs no Lambda change. The alert is best-effort: a failed publish never fails a saved report.

**Key design around access patterns.**

| Access pattern           | Query                              |
| ------------------------ | ---------------------------------- |
| One location's history   | Query on `locationId`              |
| All locations for a date | Query on the GSI                   |
| One report               | Get on `locationId` + `reportDate` |

## Security

- **Authentication:** Google via Cognito. Self sign-up is disabled, and Google is limited to approved test users.
- **Identity comes from the verified token only.** The request body and URL are never trusted for who the caller is or which location they manage.
- **Managers cannot touch other locations.** A manager's location on writes comes from the token and the body value is ignored. Reading another location returns 403.
- **No group means no access.** Every route returns 403 for a user in none of the three groups.
- **24-hour edit window is atomic.** The update carries `ConditionExpression: attribute_exists(locationId) AND editableUntil > :now`, so nothing can change between a check and the write.
- **No silent overwrites.** Creating a report uses `attribute_not_exists(locationId)`, so a duplicate for the same location and date returns 409. Managers can only file for today or yesterday, so they cannot backdate a report to gain a fresh edit window.
- **Server-side validation** repeats the form's rules (types, ranges, voids and comps not above revenue, notes under 500 characters).
- **Secrets stay out of git.** The Google client ID and secret load from `infrastructure/.env` (gitignored) at deploy time. `NEXT_PUBLIC_*` values are public by design: a pool ID, client ID, and API URL are not secrets.
- **Point-in-time recovery** is enabled on the reports table (35-day restore window).

## Running it

### Prerequisites

Node 20 or 22, AWS CLI configured, AWS CDK, and a Google OAuth client (web application) whose redirect URI is `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`.

### Deploy the backend

```bash
cd infrastructure
npm ci
# infrastructure/.env must define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OWNER_EMAIL
export $(cat .env | xargs) && cdk deploy --all
```

Always load `.env` first. Without it, the Google provider falls back to a placeholder secret.

After deploying, confirm the SNS email subscription from the message sent to the owner's inbox.

### Run the frontend locally

Create `frontend/.env.local`:

```
NEXT_PUBLIC_USER_POOL_ID=<from AuthStack outputs>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<from AuthStack outputs>
NEXT_PUBLIC_API_URL=<ApiStack ApiUrl output, without the trailing slash>
```

```bash
cd frontend && npm ci && npm run dev
```

### Hosting

Amplify builds `frontend/` using `amplify.yml`. The three variables above are set in the Amplify console. The Amplify domain must be listed in the app client's callback and sign-out URLs (`auth-stack.ts`) and in `amplify-config.ts`.

## Onboarding a user

1. Add their Gmail to the Google OAuth consent screen's test users.
2. They sign in once. This creates their Cognito user with no role (they see "no access").
3. Find their username, then assign a role:

```bash
aws cognito-idp list-users --user-pool-id <pool-id> \
  --query "Users[].[Username,Attributes[?Name=='email'].Value|[0]]"

aws cognito-idp admin-add-user-to-group --user-pool-id <pool-id> \
  --username <google-username> --group-name Managers

# managers only
aws cognito-idp admin-update-user-attributes --user-pool-id <pool-id> \
  --username <google-username> \
  --user-attributes Name=custom:locationId,Value=location-1
```

4. They sign out and back in, because group changes appear only in a new token.

## Data lifecycle

Plan: DynamoDB for the active 12 months, then S3, then Glacier. **Status: partly built.** The bucket exists with a lifecycle rule that moves objects to Glacier 2 years after they are written. The process that moves old reports from DynamoDB into S3 at 12 months does not yet exist, so the bucket is currently empty.

DynamoDB Streams is enabled on the reports table as the intended trigger for the archive job. Nothing consumes it yet.

DynamoDB TTL is deliberately **not** used. TTL deletes the item, which conflicts with indefinite retention. The edit window is enforced by the conditional update instead.

## Cost

Initial estimate for the proposal: under about $50 per month at the client's scale. This is an estimate from the service mix, **not a measurement**. There is no VPC or NAT Gateway, which was the main cost driver in an earlier project. Verify against Cost Explorer once there is real traffic.

## Known limitations and next steps

- Editing a report does not re-evaluate the low-revenue alert.
- Archive from DynamoDB to S3 is not implemented. When it is, add a rule to expire old object versions (the bucket is versioned), and decide whether the Glacier clock should start at archive time or report age.
- Report queries are not paginated, so a location's history will eventually be truncated at DynamoDB's 1 MB query limit.
- Owners can view but not submit reports.
- Report dates use UTC on the server and local time in the browser. A configured restaurant timezone would remove the evening mismatch.
- Google OAuth is in testing mode (100 test-user limit, periodic re-consent). Publishing the app would lift this.
- `frontend/.npmrc` sets `legacy-peer-deps=true` because Amplify UI declares support only up to React 18. Revisit when Amplify UI supports React 19.
- The Amplify build image currently runs Node 22 while local development used Node 20. Both build successfully.
- The API allows CORS from any origin. Restrict to the Amplify domain for production.
- No automated tests yet.
- Use a custom EventBridge bus per domain, and add a dead-letter queue for failed alert deliveries.
- “8 moderate advisories remain in the lint toolchain (minimatch under typescript-eslint); dev-only, not shipped to browsers.”

## Repository layout

```
infrastructure/   CDK app (five stacks)
backend/          Lambda handler (TypeScript)
frontend/         Next.js app (login, owner dashboard, manager page)
amplify.yml       Amplify build spec for the monorepo
```
