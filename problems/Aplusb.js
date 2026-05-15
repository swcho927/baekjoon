// ═══════════════════════════════════════════════════════
//  problems/aplusb.js  —  1000번 A+B
//
//  이 파일의 역할:
//    1) 이 문제의 정답 solver 정의
//    2) 테스트케이스 생성 (generateTC)
//    3) window.PROBLEMS['aplusb'] 에 등록
//
//  즉시실행함수(IIFE)로 감싸서 전역 오염 방지
// ═══════════════════════════════════════════════════════

(function () {

    // ── Solver: 정답 계산 ─────────────────────────────────
    // 테스트케이스 정답을 하드코딩하지 않고
    // 이 함수로 자동 계산 → 정답 오류 원천 차단
    function solve(a, b) {
        return a + b;
    }

    // ── TC 저장소 ─────────────────────────────────────────
    const tc = [];

    // 헬퍼: 케이스 추가
    // 입력은 "A\nB" 형태 (각 줄에 하나씩 입력받으므로)
    function add(a, b) {
        tc.push({
            in:  `${a}\n${b}`,           // 입력: 두 줄
            out: String(solve(a, b))      // 기댓값
        });
    }

    // ── TC 생성 함수 ──────────────────────────────────────
    function generateTC() {
        tc.length = 0; // 혹시 재생성 시 초기화

        // A. 공식 예제
        add(1, 2);   // → 3

        // B. 경계값
        add(1, 1);   // 최솟값
        add(9, 9);   // 최댓값
        add(1, 9);   // 비대칭
        add(9, 1);   // 비대칭 반대

        // C. 중간값
        add(5, 5);
        add(3, 7);
        add(4, 6);
        add(2, 8);

        // D. 교환법칙 확인 (a+b == b+a 여야 함)
        add(2, 7);
        add(7, 2);

        // 테스트케이스 수 UI 업데이트
        document.getElementById('tcCountAplusb').innerText = `총 ${tc.length}개`;
    }

    // ── PROBLEMS 레지스트리에 등록 ────────────────────────
    window.PROBLEMS['aplusb'] = {
        testCases:  tc,          // 채점에 사용할 TC 배열
        generateTC: generateTC   // judge.js 가 초기화 시 호출
    };

})();
