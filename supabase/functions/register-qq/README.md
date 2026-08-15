# register-qq

Public account-application endpoint for the community site. It creates an
unconfirmed Supabase Auth identity without sending email. The database trigger
creates a pending profile; administrator approval later confirms the identity.

Deploy with JWT verification disabled because applicants are not signed in:

```sh
supabase functions deploy register-qq --no-verify-jwt
```

Before public launch, protect this endpoint with Cloudflare Turnstile and an
application-level rate limit.
