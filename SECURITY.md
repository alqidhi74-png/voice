# Security baseline

## Production gates

Production startup is fail-closed. Configure separate, high-entropy secrets for
`VOICEPRINT_MASTER_KEYS` and `AUDIT_HMAC_KEYS`, select active versions, set exact
HTTPS origins, and enable `REQUIRE_PRODUCTION_ANTISPOOF=true`.

The bundled spectral anti-spoof service is a development placeholder. With the
production gate enabled, its result is treated as unavailable and can never
produce `ACCEPT`. Replace it with a trained, evaluated service whose health
response does not identify itself as a placeholder or heuristic.

## Firebase deployment

The browser has no direct access to Firestore or Firebase Storage. The Admin SDK
backend owns all access control. Deploy the committed rules and indexes:

```powershell
firebase deploy --only firestore:indexes,firestore:rules,storage --project <project-id>
```

The deploying identity needs the Firebase rules/index permissions and
`serviceusage.services.use` on the project.

## Key rotation

Use versioned JSON keyrings. New writes use the active version; reads retain old
versions and automatically re-wrap data keys with the active version.

```env
VOICEPRINT_MASTER_KEYS={"1":"old-secret","2":"new-secret"}
VOICEPRINT_ACTIVE_KEY_VERSION=2
AUDIT_HMAC_KEYS={"1":"old-audit-secret","2":"new-audit-secret"}
AUDIT_ACTIVE_KEY_VERSION=2
```

Do not remove an old encryption key until every stored `wrappedDataKey` has been
read/re-wrapped or migrated. Store production secrets in a managed secret/KMS
system rather than source control or an image layer.

## Operational checks

- `GET /api/health` is liveness only.
- `GET /api/health/ready` checks Firebase and both ML services with a timeout.
- `GET /api/health/detailed` requires an administrator token.
- `npm run security:audit` fails if plaintext uploads or malformed ciphertext
  are present locally.
- `DELETE /api/user/account` requires a token issued within five minutes and
  the body `{ "confirmation": "DELETE" }`.

Run tests, storage audit, and the live E2E harness before releases. Audit HMACs
detect record edits; use immutable/externally retained logs if deletion-proof
audit history is required by the deployment's compliance regime.
