#!/usr/bin/env python3
import argparse
import json
import os
import sys
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def http_json(method, url, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urlopen(req) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else None
    except HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = raw
        return e.code, payload


def http_multipart(url, fields, file_field, file_path, file_name, file_type, headers=None):
    boundary = '----OpenClawBoundary' + uuid.uuid4().hex
    parts = []
    with open(file_path, 'rb') as f:
        content = f.read()
    parts.append((
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'
        f'Content-Type: {file_type}\r\n\r\n'
    ).encode() + content + b'\r\n')
    for k, v in fields.items():
        parts.append((
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        ).encode())
    parts.append(f'--{boundary}--\r\n'.encode())
    body = b''.join(parts)
    req_headers = dict(headers or {})
    req_headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
    req = Request(url, data=body, headers=req_headers, method='POST')
    try:
        with urlopen(req) as r:
            raw = r.read().decode()
            try:
                payload = json.loads(raw) if raw else None
            except Exception:
                payload = raw
            return r.status, payload
    except HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = raw
        return e.code, payload


def main():
    ap = argparse.ArgumentParser(description='Smoke-test voice JWT/runtime path against local or remote Supabase')
    ap.add_argument('--base-url', required=True)
    ap.add_argument('--service-key', required=True)
    ap.add_argument('--user-jwt', required=True)
    ap.add_argument('--audio-path', required=True)
    ap.add_argument('--pro-id', help='Existing pro_profile id to use. If omitted, picks the first pro_profile.')
    ap.add_argument('--audio-url', default='https://example.com/tmp-test-tone.m4a')
    ap.add_argument('--duration-sec', type=int, default=1)
    args = ap.parse_args()

    service_headers = {
        'apikey': args.service_key,
        'Authorization': f'Bearer {args.service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    user_json_headers = {
        'Authorization': f'Bearer {args.user_jwt}',
        'Content-Type': 'application/json',
    }
    user_auth_headers = {
        'Authorization': f'Bearer {args.user_jwt}',
    }

    result = {
        'base_url': args.base_url,
        'steps': {},
        'summary': {},
    }

    pro_id = args.pro_id
    if not pro_id:
        st, pros = http_json('GET', args.base_url + '/rest/v1/pro_profiles?select=id&limit=1', headers=service_headers)
        result['steps']['select_pro'] = {'status': st, 'body': pros}
        if st >= 400 or not pros:
            print(json.dumps(result, ensure_ascii=False, indent=2))
            sys.exit(1)
        pro_id = pros[0]['id']

    st, memo_rows = http_json('POST', args.base_url + '/rest/v1/voice_memos', {
        'pro_id': pro_id,
        'member_id': None,
        'audio_url': args.audio_url,
        'duration_sec': args.duration_sec,
        'status': 'recording',
    }, headers=service_headers)
    result['steps']['create_memo'] = {'status': st, 'body': memo_rows}
    if st >= 400 or not memo_rows:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(1)
    memo_id = memo_rows[0]['id']
    result['summary']['memo_id'] = memo_id
    result['summary']['pro_id'] = pro_id

    st, body = http_json('POST', args.base_url + '/functions/v1/voice-fsm-controller', {
        'operation': 'initCache',
        'memo_id': memo_id,
    }, headers=user_json_headers)
    result['steps']['init_cache'] = {'status': st, 'body': body}

    st, body = http_multipart(
        args.base_url + '/functions/v1/voice-transcribe',
        {
            'voice_memo_id': memo_id,
            'duration': str(args.duration_sec),
        },
        'audio',
        args.audio_path,
        os.path.basename(args.audio_path),
        'audio/mp4',
        headers=user_auth_headers,
    )
    result['steps']['voice_transcribe'] = {'status': st, 'body': body}

    st, cache = http_json(
        'GET',
        args.base_url + f'/rest/v1/voice_memo_cache?select=memo_id,state,updated_at,transcription_job_id,transcript,audio_blob_ref&memo_id=eq.{memo_id}',
        headers=service_headers,
    )
    result['steps']['read_cache'] = {'status': st, 'body': cache}

    st, jobs = http_json(
        'GET',
        args.base_url + f'/rest/v1/transcription_jobs?select=id,status,voice_memo_id,transcript,error_message,audio_url&voice_memo_id=eq.{memo_id}&order=created_at.desc',
        headers=service_headers,
    )
    result['steps']['read_jobs'] = {'status': st, 'body': jobs}

    result['summary']['init_cache_ok'] = result['steps']['init_cache']['status'] < 400
    result['summary']['voice_transcribe_ok'] = result['steps']['voice_transcribe']['status'] < 400
    result['summary']['cache_state'] = cache[0]['state'] if isinstance(cache, list) and cache else None
    result['summary']['job_statuses'] = [j.get('status') for j in jobs] if isinstance(jobs, list) else None

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
