#!/usr/bin/env python3
import json
import os
import sys
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://phstuugdppfutjcpislh.supabase.co')
SERVICE_KEY = os.environ.get('SERVICE_KEY')
USER_JWT = os.environ.get('USER_JWT')
AUDIO_PATH = os.environ.get('AUDIO_PATH', '/Users/minsu/.openclaw/workspace/projects/hellonext/tmp-test-tone.m4a')

if not SERVICE_KEY:
    print(json.dumps({'error': 'Missing SERVICE_KEY env'}))
    sys.exit(1)
if not USER_JWT:
    print(json.dumps({'error': 'Missing USER_JWT env'}))
    sys.exit(1)

service_headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

def service_req(method, path, body=None):
    req = Request(
        SUPABASE_URL + path,
        data=None if body is None else json.dumps(body).encode(),
        headers=service_headers,
        method=method,
    )
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else raw
        except Exception:
            return e.code, raw

status, pros = service_req('GET', '/rest/v1/pro_profiles?select=id&limit=1')
if status >= 400 or not pros:
    print(json.dumps({'stage': 'select_pro', 'status': status, 'body': pros}, ensure_ascii=False, indent=2))
    sys.exit(1)

pro_id = pros[0]['id']
status, memo_rows = service_req('POST', '/rest/v1/voice_memos', {
    'pro_id': pro_id,
    'member_id': None,
    'audio_url': 'https://example.com/tmp-test-tone.m4a',
    'duration_sec': 1,
    'status': 'recording',
})
if status >= 400 or not memo_rows:
    print(json.dumps({'stage': 'create_memo', 'status': status, 'body': memo_rows}, ensure_ascii=False, indent=2))
    sys.exit(1)

memo_id = memo_rows[0]['id']

init_headers = {
    'Authorization': f'Bearer {USER_JWT}',
    'Content-Type': 'application/json',
}
init_req = Request(
    SUPABASE_URL + '/functions/v1/voice-fsm-controller',
    data=json.dumps({'operation': 'initCache', 'memo_id': memo_id}).encode(),
    headers=init_headers,
    method='POST',
)
try:
    with urlopen(init_req) as resp:
        init_status = resp.status
        init_body = resp.read().decode()
except HTTPError as e:
    init_status = e.code
    init_body = e.read().decode()

boundary = '----OpenClawBoundary' + uuid.uuid4().hex
with open(AUDIO_PATH, 'rb') as f:
    audio = f.read()
parts = []
parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="tmp-test-tone.m4a"\r\nContent-Type: audio/mp4\r\n\r\n').encode() + audio + b'\r\n')
parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="voice_memo_id"\r\n\r\n{memo_id}\r\n').encode())
parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="duration"\r\n\r\n1\r\n').encode())
parts.append(f'--{boundary}--\r\n'.encode())
body = b''.join(parts)
invoke_headers = {
    'Authorization': f'Bearer {USER_JWT}',
    'Content-Type': f'multipart/form-data; boundary={boundary}',
}
invoke_req = Request(SUPABASE_URL + '/functions/v1/voice-transcribe', data=body, headers=invoke_headers, method='POST')
try:
    with urlopen(invoke_req) as resp:
        invoke_status = resp.status
        invoke_body = resp.read().decode()
except HTTPError as e:
    invoke_status = e.code
    invoke_body = e.read().decode()

_, cache_rows = service_req('GET', f'/rest/v1/voice_memo_cache?select=memo_id,state,updated_at,transcription_job_id,transcript,audio_blob_ref&memo_id=eq.{memo_id}')
_, jobs = service_req('GET', f'/rest/v1/transcription_jobs?select=id,status,voice_memo_id,transcript,error_message,audio_url&voice_memo_id=eq.{memo_id}&order=created_at.desc')

print(json.dumps({
    'memo_id': memo_id,
    'pro_id': pro_id,
    'init_status': init_status,
    'init_body': init_body,
    'invoke_status': invoke_status,
    'invoke_body': invoke_body,
    'cache_rows': cache_rows,
    'jobs': jobs,
}, ensure_ascii=False, indent=2))
