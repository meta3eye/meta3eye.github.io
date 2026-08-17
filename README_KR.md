# SPIRIT SYSTEM v0.2

## 구조
네이버 블로그 -> GitHub Pages -> Supabase

## 배포 전 준비
1. 이 폴더의 `config.js.example`을 `config.js`로 복사합니다.
2. Supabase의 API URL을 `SUPABASE_URL`에 넣습니다.
3. Supabase의 Publishable key를 `SUPABASE_PUBLISHABLE_KEY`에 넣습니다.
4. `config.js`에는 service_role/secret key를 절대 넣지 않습니다.

## Supabase
현재 프로젝트에 이미 기본 4개 테이블이 생성되어 있다면 `supabase_final_setup.sql`을 한 번 실행할 수 있습니다. 이 파일은 DROP TABLE / DROP POLICY / DROP TRIGGER를 사용하지 않으며 기존 객체가 있으면 재사용합니다.

## 주의
현재 v0.2의 초기 능력 측정은 게임용 프로토타입입니다. 실제 심리·영적 능력을 과학적으로 측정하는 검사가 아닙니다.
생사 판별 퀘스트는 정답 노출 방지를 위해 별도의 서버측 문제은행/Edge Function 구조로 추가해야 합니다.
