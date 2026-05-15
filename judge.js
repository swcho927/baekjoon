// ════════════════════════════════════════════════════════
//  judge.js  ─  그뭐냐 채점 엔진
//
//  index.html이 호출하는 함수:
//    submitCode('1000')    → 채점 시작 (버튼 onclick)
//    switchProblem('1000') → 사이드바 탭 전환 (탭 onclick)
//
//  내부 구조:
//    1. 그뭐냐 인터프리터 (resolveAddr, tokenizeLine, getVal, runCode)
//    2. 채점 UI 제어 (submitCode)
//    3. 탭 전환 (switchProblem)
//    4. 초기화 (페이지 로드 시 테스트케이스 개수 표시)
// ════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════
//  1. 그뭐냐 인터프리터 핵심 로직
//     원본 컴파일러에서 DOM 의존성 제거, 순수 실행 엔진
// ════════════════════════════════════════════════════════

// 메모리와 프로그램 카운터 (전역 - runCode 실행마다 초기화)
var memory = {};
var pc = 0;

// ── 주소 해결기 ──
// "그" 개수 = 주소 번호, "거" 있으면 포인터 역참조
// 예: "그" → 1번, "그그" → 2번, "그거" → memory[1]번 주소
function resolveAddr(memStr) {
    let geuCount = (memStr.match(/그/g) || []).length;
    let geoCount = (memStr.match(/거/g) || []).length;
    let addr = geuCount;
    for (let i = 0; i < geoCount - 1; i++) {
        addr = memory[addr] || 0;
    }
    return addr;
}

// ── 토크나이저 ──
// 한 줄을 명령어/메모리/숫자/연산자 토큰으로 분해
// getVal()이 내부적으로 사용
function tokenizeLine(text) {
    const regex = /(#.*)|(그+거+)|(그+)|(진짜뭐지|진짜뭐냐|뭐더라|뭐지|뭐냐|있잖아)|(아|어)|(\.\.\.|\.\.|\.|,,|,|;;|;|~)/g;
    let tokens = [];
    let lastIdx = 0;

    text.replace(regex, (match, comm, mem, num, cmd, bracket, op, offset) => {
        if (offset > lastIdx) tokens.push({ type: 'text',    val: text.slice(lastIdx, offset) });
        if      (comm)    tokens.push({ type: 'comment', val: comm });
        else if (mem)     tokens.push({ type: 'mem',     val: mem, addr: resolveAddr(mem) });
        else if (num)     tokens.push({ type: 'num',     val: num });
        else if (cmd)     tokens.push({ type: 'cmd',     val: cmd });
        else if (bracket) tokens.push({ type: 'bracket', val: bracket });
        else if (op)      tokens.push({ type: 'op',      val: op });
        lastIdx = offset + match.length;
    });

    if (lastIdx < text.length) tokens.push({ type: 'text', val: text.slice(lastIdx) });
    return tokens;
}

// ── 수식 파서 ──
// 토큰 배열을 읽어 값을 계산 (원본 getVal 그대로)
function getVal(expr) {
    const toks = tokenizeLine(expr).filter(t => t.type !== 'text' && t.type !== 'comment');
    if (toks.length === 0) return 0;
    let pos = 0;
    const consume = () => toks[pos++];
    const peek    = () => toks[pos];

    // 괄호(아~어) / 메모리값 / 숫자("그" 개수)
    function parseAtom() {
        let t = consume(); if (!t) return 0;
        if (t.type === 'bracket' && t.val === '아') { let res = parseExpr(); consume(); return res; }
        if (t.type === 'mem') return memory[resolveAddr(t.val)] || 0;
        if (t.type === 'num') return t.val.length; // "그그그" → 3
        return 0;
    }
    // 곱셈(.) / 나눗셈(..) / 나머지(...)
    function parseFactor() {
        let node = parseAtom();
        while (peek() && peek().type === 'op' && ['.', '..', '...'].includes(peek().val)) {
            let op = consume().val, right = parseAtom();
            if (op === '.')   node *= right;
            else if (op === '..') node = Math.floor(node / right);
            else              node %= right;
        }
        return node;
    }
    // 덧셈(,) / 뺄셈(,,)
    function parseTerm() {
        let node = parseFactor();
        while (peek() && peek().type === 'op' && [',', ',,'].includes(peek().val)) {
            let op = consume().val, right = parseFactor();
            node = op === ',' ? node + right : node - right;
        }
        return node;
    }
    // 비교: 같음(~) / 큼(;) / 크거나같음(;;)
    function parseExpr() {
        let node = parseTerm();
        while (peek() && peek().type === 'op' && ['~', ';', ';;'].includes(peek().val)) {
            let op = consume().val, right = parseTerm();
            if      (op === '~')  node = node === right ? 1 : 0;
            else if (op === ';')  node = node > right   ? 1 : 0;
            else if (op === ';;') node = node >= right  ? 1 : 0;
        }
        return node;
    }
    return parseExpr();
}

// ── 코드 실행 ──
// @param code  {string} 그뭐냐 코드
// @param input {string} 입력값 (줄바꿈으로 구분)
// @returns { output: string, error: string }
function runCode(code, input) {
    // 실행 환경 초기화
    memory = {};
    pc = 0;
    let outputBuffer = "";
    let inputLines   = input.split("\n");
    let inputIndex   = 0;
    let linesArr     = code.split("\n");
    const MAX_STEPS  = 100000; // 무한루프 방지
    let stepCount    = 0;

    try {
        while (pc >= 0 && pc < linesArr.length && stepCount < MAX_STEPS) {
            stepCount++;

            // 주석 제거 + 공백 제거
            let fullLine = linesArr[pc].split('#')[0].trim();
            let jumped   = false;

            if (fullLine) {
                if (fullLine.includes("뭐더라")) {
                    // 대입: "주소뭐더라 값" → memory[주소] = 값
                    let [m, e] = fullLine.split("뭐더라");
                    memory[resolveAddr(m.trim())] = getVal(e.trim());
                }
                else if (fullLine.includes("진짜뭐지")) {
                    // 문자 입력: 첫 글자의 ASCII 코드를 저장
                    let targetAddr = resolveAddr(fullLine.replace("진짜뭐지", "").trim());
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "";
                    memory[targetAddr] = (val && val.length > 0) ? val.charCodeAt(0) : 0;
                }
                else if (fullLine.includes("진짜뭐냐")) {
                    // 문자 출력: 숫자 → ASCII 문자
                    outputBuffer += String.fromCharCode(getVal(fullLine.replace("진짜뭐냐", "")));
                }
                else if (fullLine.includes("뭐지")) {
                    // 숫자 입력
                    let targetAddr = resolveAddr(fullLine.replace("뭐지", "").trim());
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "0";
                    memory[targetAddr] = parseInt(val) || 0;
                }
                else if (fullLine.includes("뭐냐")) {
                    // 숫자 출력
                    outputBuffer += String(getVal(fullLine.replace("뭐냐", "")));
                }
                else if (fullLine.includes("있잖아")) {
                    // 점프: pc += offset
                    pc += getVal(fullLine.replace("있잖아", ""));
                    jumped = true;
                }
            }

            if (!jumped) pc++;
        }

        if (stepCount >= MAX_STEPS) {
            return { output: outputBuffer.trim(), error: "시간 초과 (" + MAX_STEPS + "회 초과)" };
        }

        return { output: outputBuffer.trim(), error: "" };

    } catch (err) {
        return { output: outputBuffer.trim(), error: "런타임 에러: " + err.message };
    }
}


// ════════════════════════════════════════════════════════
//  2. 채점 UI 제어
//     index.html의 버튼이 submitCode('1000') 호출
// ════════════════════════════════════════════════════════
var isJudging = false;

async function submitCode(probId) {
    // 중복 실행 방지
    if (isJudging) return;

    // 문제 데이터 가져오기
    var prob = window.PROBLEMS[probId];
    if (!prob) { alert("문제 데이터를 찾을 수 없습니다: " + probId); return; }

    // 에디터에서 코드 가져오기 (textarea)
    var code = document.getElementById("editor-" + probId).value.trim();
    if (!code) { alert("코드를 입력해주세요."); return; }

    var tcs   = prob.testCases;
    var total = tcs.length;

    // ── DOM 요소 참조 (index.html의 ID 규칙: 요소명-probId) ──
    var btn         = document.getElementById("sBtn-"         + probId);
    var progressWrap = document.getElementById("progressWrap-" + probId);
    var progressFill = document.getElementById("progressFill-" + probId);
    var progressNum  = document.getElementById("progressNum-"  + probId);
    var progressText = document.getElementById("progressText-" + probId);
    var resultBox   = document.getElementById("resultBox-"    + probId);
    var errorLog    = document.getElementById("errorLog-"     + probId);

    // ── UI 초기화 ──
    isJudging = true;
    btn.disabled = true;
    btn.textContent = "채점 중...";

    progressWrap.style.display = "block";
    progressFill.style.width   = "0%";
    progressFill.style.background = "linear-gradient(90deg, var(--blue-dark), var(--blue))";
    progressNum.textContent  = "0 / " + total;
    progressText.textContent = "0%";

    resultBox.style.display = "none";
    resultBox.className     = "result-display";
    resultBox.textContent   = "";
    errorLog.style.display  = "none";
    errorLog.textContent    = "";

    // ── 테스트케이스 순서대로 실행 ──
    var allPassed    = true;
    var firstFail    = "";

    for (var i = 0; i < total; i++) {
        var tc = tcs[i];

        // 진행 표시 업데이트
        progressNum.textContent  = (i + 1) + " / " + total;
        var pct = Math.round(((i + 1) / total) * 100);

        // 코드 실행 (동기 - 그뭐냐 엔진은 순수 JS)
        var result = runCode(code, tc.in);

        // 진행 바 업데이트
        progressFill.style.width = pct + "%";
        progressText.textContent = pct + "%";

        // 결과 판정
        if (result.error) {
            allPassed = false;
            if (!firstFail) firstFail = "[테스트 " + (i+1) + "] 에러\n" + result.error;
        } else if (result.output.trim() !== String(tc.out).trim()) {
            allPassed = false;
            if (!firstFail) {
                firstFail =
                    "[테스트 " + (i+1) + "]\n" +
                    "입력:    " + tc.in.replace(/\n/g, " / ") + "\n" +
                    "정답:    " + tc.out + "\n" +
                    "내 출력: " + result.output;
            }
        }

        // 브라우저가 화면을 업데이트할 수 있도록 잠깐 양보
        // (이게 없으면 루프 중에 화면이 안 바뀜)
        await new Promise(function(r) { setTimeout(r, 80); });
    }

    // ── 최종 결과 표시 ──
    resultBox.style.display = "block";

    if (allPassed) {
        progressFill.style.background = "var(--green)";
        resultBox.className   = "result-display res-success";
        resultBox.textContent = "맞았습니다!! 🎉";
    } else {
        progressFill.style.background = "var(--red)";
        resultBox.className   = "result-display res-fail";
        resultBox.textContent = "틀렸습니다";
        errorLog.style.display  = "block";
        errorLog.textContent    = firstFail;
    }

    btn.disabled    = false;
    btn.textContent = "다시 제출";
    isJudging       = false;
}


// ════════════════════════════════════════════════════════
//  3. 탭 전환
//     index.html 사이드바의 onclick="switchProblem('1000')"
// ════════════════════════════════════════════════════════
function switchProblem(probId) {
    // 모든 페이지/탭 비활성화
    document.querySelectorAll('.prob-page').forEach(function(el) {
        el.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-item').forEach(function(el) {
        el.classList.remove('active');
    });

    // 선택한 페이지/탭 활성화
    var page = document.getElementById("page-"  + probId);
    var tab  = document.getElementById("tab-"   + probId);
    if (page) page.classList.add('active');
    if (tab)  tab.classList.add('active');
}


// ════════════════════════════════════════════════════════
//  4. 페이지 로드 시 초기화
//     테스트케이스 개수를 info-table에 표시
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    // 등록된 모든 문제의 TC 개수 표시
    Object.keys(window.PROBLEMS).forEach(function(probId) {
        var prob  = window.PROBLEMS[probId];
        var el    = document.getElementById("tcCount-" + probId);
        if (el) el.textContent = prob.testCases.length + "개";
    });
});
