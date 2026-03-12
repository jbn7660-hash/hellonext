# Team: Sprint 2 Kickoff (HelloNext)

## Context
You are planning Sprint 2 execution for the HelloNext repo.

### Sprint 2 context (authoritative)

```markdown
# Sprint 2: 핵심 AI 루프 (v0.2 Alpha)
- 2-1 외부 API 연결: OpenAI Whisper 테스트, Cloudinary 업로드 테스트, (옵션) 카카오 알림톡
- 2-2 Edge Function 배포: voice-to-report, voice-transcribe, voice-fsm-controller, send-notification/push-send
- 2-3 음성→리포트 E2E: 녹음→전사→구조화→리포트 생성, 고아메모, FSM 로그 확인

Known notes:
- Kakao OAuth is blocked (account_email permission locked) — skip for this sprint.
- Local build works when Sentry upload is disabled (SENTRY_AUTH_TOKEN empty).
- Typecheck errors exist; build uses ignoreBuildErrors.
```

### Repo pointers
- Use `todo.md`, `claude.md`, `docs/`, `memory.md`, `supabase/`.
- Prefer minimal, verifiable steps.

## Desired Outputs
1) Sprint 2 plan with ordered tasks (2-1/2-2/2-3), each with acceptance criteria.
2) Minimal env var list needed (NAMES ONLY).
3) Proposed first PR: smallest change that makes progress this sprint.

---

## agent: planner
- tool: claude
- model: claude-opus-4-6
- prompt: |
    You are the sprint planner.

    Create a practical execution plan for Sprint 2 grouped by 2-1/2-2/2-3.
    For each task include: (a) why, (b) acceptance criteria, (c) how to test locally.
    Keep it minimal and ordered. End with the first 3 tasks as a “do next” checklist.

    IMPORTANT: You already have the Sprint 2 context above. Do NOT ask the user for more instructions. Produce the plan now.

## agent: implementer
- tool: codex
- model: gpt-5.2
- depends: planner
- prompt: |
    You are the implementer.

    Based on the planner output, propose the FIRST PR only.
    Provide: files to change (exact paths), code-level approach, and exact commands to validate.
    Keep scope small.

    IMPORTANT: Do NOT ask the user for instructions. Produce the PR proposal now.

## agent: reviewer
- tool: gemini
- model: gemini-2.5-flash-lite
- depends: implementer
- prompt: |
    You are the reviewer.

    Review the FIRST PR proposal for risks (secrets/env vars, security, edge function deployment gotchas, cost).
    Suggest improvements.

    IMPORTANT: Do NOT ask the user for instructions. Provide review now.
