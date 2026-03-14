# Fast path: get a fresh remote USER_JWT from an already-working account

Use an already verified/login-capable account. This avoids signup email rate limits.

## Browser console method (fastest)

1. Open the deployed or local web app connected to remote Supabase.
2. Log in with an existing account.
3. Open DevTools console.
4. Run:

```js
const { data } = await window.supabase.auth.getSession()
console.log(data.session?.access_token)
```

If `window.supabase` is not exposed, run this on a page where app code has loaded a client, or use localStorage inspection:

```js
Object.keys(localStorage)
  .filter(k => k.includes('auth-token'))
  .forEach(k => console.log(k, localStorage.getItem(k)))
```

In most Supabase apps, the access token is inside the auth-token JSON blob.

## Then run remote smoke

```bash
cd /Users/minsu/.openclaw/workspace/projects/hellonext
USER_JWT='(fresh access token)' ./scripts/run-voice-smoke.sh remote
```

Remote service key already exists in:
- `supabase/functions/voice-transcribe/.env.voice-transcribe`
- `.env.local`

## Fast interpretation

Expected useful outcomes:
- `transcribe_status=200` → remote path healthy
- `transcribe_status=401` → JWT stale/invalid; fetch a fresh token from an already verified account
- `transcribe_status=502` → auth passed; inspect Whisper/OpenAI upstream failure
- `transcribe_status=500` → function/runtime/config problem; inspect response body and env secrets

Also confirm:
- `steps.init_cache.status = 200`
- `summary.cache_state = PREPROCESSED` after successful transcription
- `steps.read_jobs.body[0].status` is `completed` or a clearly explained failure
