# Supabase Migration Tests

## 실행 방법

### 1. Supabase Dashboard SQL Editor
1. Supabase 프로젝트 대시보드 접속
2. SQL Editor 열기
3. 테스트 파일 내용 붙여넣기
4. Run 실행
5. Messages 탭에서 PASS/FAIL 확인

### 2. psql CLI
```bash
# Supabase 프로젝트에 직접 연결
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/tests/001_users_and_profiles_test.sql

# 또는 로컬 (supabase start 후)
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -f supabase/tests/001_users_and_profiles_test.sql
```

## 테스트 파일 목록

| 파일 | 대상 마이그레이션 | 검증 항목 |
|------|------------------|-----------|
| `001_users_and_profiles_test.sql` | 001 + 008 | 테이블, 컬럼, CHECK, UNIQUE, FK, 인덱스, 트리거, RLS, INSERT/SELECT |
| `002_voice_memos_and_reports_test.sql` | 002 + 008 | 테이블, 컬럼, CHECK, FK, 인덱스, 트리거, RLS, 범위 위반 |
| `003_swing_videos_and_pose_test.sql` | 003 + 008 | 테이블, 컬럼, CHECK, UNIQUE(1:1), FK CASCADE, RLS |
| `007_error_patterns_and_glossary_test.sql` | 007 + 008 | 시드 22개, P1-P8 분포, causality_parents 참조, UNIQUE, RLS |

## 전제 조건

- 마이그레이션 001~008 모두 적용 완료
- service_role 권한으로 실행 (RLS bypass 필요)
- 테스트는 자체 데이터 생성/삭제 (기존 데이터 영향 없음)

## 출력 형식

```
NOTICE: PASS: 모든 테이블 존재 확인
NOTICE: PASS: 컬럼 스키마 검증 완료
...
NOTICE: ========================================
NOTICE: Migration 001 테스트 전체 완료
NOTICE: ========================================
```

FAIL이 발생하면 해당 ASSERT 메시지에 원인이 포함됩니다.
