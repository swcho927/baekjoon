// ═══════════════════════════════════════════════════════
//  problems/aplusb.js  —  1000번 A+B
//
//  [공부 포인트] IIFE (즉시실행함수 표현식) 패턴
//  (function(){ ... })() 로 감싸면 내부 변수가 전역을 오염시키지 않음.
//  window.PROBLEMS 에만 결과를 등록하고 나머지는 모두 비공개.
// ═══════════════════════════════════════════════════════

(function () {

    // 정답 계산 함수 — TC 정답을 하드코딩하지 않고 자동 계산
    function solve(a, b) { return a + b; }

    // TC 배열 — add() 로 채워짐
    const tc = [];

    // 헬퍼: 입력은 "A\nB" 형태 (뭐지가 줄 단위로 읽으므로)
    function add(a, b) {
        tc.push({ in: `${a}\n${b}`, out: String(solve(a, b)) });
    }

    function generateTC() {
        tc.length = 0;

        // A. 공식 예제
        add(1, 2);

        // B. 경계값
        add(1, 1);
        add(9, 9);
        add(1, 9);
        add(9, 1);

        // C. 중간값
        add(5, 5);
        add(3, 7);
        add(4, 6);
        add(2, 8);

        // D. 교환법칙 확인
        add(2, 7);
        add(7, 2);

        // TC 수 UI 업데이트
        // [공부 포인트] getElementById 는 DOM 이 완성된 후에만 동작.
        // generateTC 는 DOMContentLoaded 이후 호출되므로 안전.
        const el = document.getElementById('tcCountAplusb');
        if (el) el.innerText = `총 ${tc.length}개`;
    }

    // [공부 포인트] window.PROBLEMS 는 index.html <head> 의 인라인 스크립트에서
    // 이미 {} 로 초기화됐기 때문에 여기서 바로 키를 추가할 수 있음.
    window.PROBLEMS['aplusb'] = {
        testCases:  tc,
        generateTC: generateTC
    };

})();
