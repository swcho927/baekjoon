// ════════════════════════════════════════════════════════
//  judge.js  ─  "그 뭐냐" 언어 채점 엔진
//
//  원본 컴파일러(그뭐냐 인터프리터)를 채점용으로 개조:
//    - DOM 의존성 완전 제거 (editor, consoleElem 등 불필요)
//    - requestConsoleInput() → 미리 준비된 입력값 배열로 교체
//    - 나머지 핵심 로직(resolveAddr, getVal, takeStep)은 원본 그대로 유지
// ════════════════════════════════════════════════════════

var monacoEditor = null;
var engineReady  = false;
var isJudging    = false;


// ════════════════════════════════════════════════════════
//  1. Monaco 에디터 초기화
// ════════════════════════════════════════════════════════
function initEditor(starterCode) {
    require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs" }
    });

    require(["vs/editor/editor.main"], function () {
        monacoEditor = monaco.editor.create(
            document.getElementById("editor-container"),
            {
                value: starterCode,
                language: "plaintext",   // 그뭐냐는 Python이 아니므로 plaintext
                theme: "vs-dark",
                automaticLayout: true,
                fontSize: 15,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
            }
        );

        // 에디터 로드 완료 → 엔진은 별도 로드 필요 없음 (순수 JS)
        initEngine();
    });
}


// ════════════════════════════════════════════════════════
//  2. 엔진 준비 확인
//     그뭐냐 엔진은 순수 JS이므로 항상 즉시 준비 완료
// ════════════════════════════════════════════════════════
function initEngine() {
    engineReady = true;
    setStatus("ready", "엔진 준비 완료");
    var btn = document.getElementById("submit-btn");
    btn.disabled = false;
    btn.textContent = "제출 및 채점";
}


// ════════════════════════════════════════════════════════
//  3. 그뭐냐 인터프리터 핵심 로직
//     원본 컴파일러에서 DOM 의존성만 제거하고 그대로 이식
// ════════════════════════════════════════════════════════

// ── 주소 해결기: "그그거" 같은 메모리 주소 표현을 숫자로 변환 ──
// 원본 resolveAddr() 그대로
function resolveAddr(memStr) {
    let geuCount = (memStr.match(/그/g) || []).length;
    let geoCount = (memStr.match(/거/g) || []).length;
    let addr = geuCount;
    // 포인터 역참조: 거가 있으면 해당 주소의 값을 따라감
    for (let i = 0; i < geoCount - 1; i++) {
        addr = memory[addr] || 0;
    }
    return addr;
}

// ── 토크나이저: 한 줄을 토큰 배열로 분해 ──
// 원본 tokenizeLine() 그대로 (단, DOM hover 관련 부분은 채점에 불필요하지만 getVal이 의존하므로 유지)
function tokenizeLine(text) {
    const regex = /(#.*)|(그+거+)|(그+)|(진짜뭐지|진짜뭐냐|뭐더라|뭐지|뭐냐|있잖아)|(아|어)|(\.\.\.|\.\.|\.|,,|,|;;|;|~)/g;
    let tokens = [];
    let lastIdx = 0;

    text.replace(regex, (match, comm, mem, num, cmd, bracket, op, offset) => {
        if (offset > lastIdx) tokens.push({ type: "text", val: text.slice(lastIdx, offset) });
        if      (comm)    tokens.push({ type: "comment", val: comm });
        else if (mem)     tokens.push({ type: "mem",     val: mem, addr: resolveAddr(mem) });
        else if (num)     tokens.push({ type: "num",     val: num });
        else if (cmd)     tokens.push({ type: "cmd",     val: cmd });
        else if (bracket) tokens.push({ type: "bracket", val: bracket });
        else if (op)      tokens.push({ type: "op",      val: op });
        lastIdx = offset + match.length;
    });

    if (lastIdx < text.length) tokens.push({ type: "text", val: text.slice(lastIdx) });
    return tokens;
}

// ── 수식 파서: 토큰 배열에서 값 계산 ──
// 원본 getVal() 그대로
function getVal(expr) {
    const toks = tokenizeLine(expr).filter(t => t.type !== "text" && t.type !== "comment");
    if (toks.length === 0) return 0;
    let pos = 0;
    const consume = () => toks[pos++];
    const peek    = () => toks[pos];

    // 괄호(아~어) 또는 메모리값 또는 숫자(그 개수)
    function parseAtom() {
        let t = consume(); if (!t) return 0;
        if (t.type === "bracket" && t.val === "아") { let res = parseExpr(); consume(); return res; }
        if (t.type === "mem") return memory[resolveAddr(t.val)] || 0;
        if (t.type === "num") return t.val.length;  // '그' 개수가 숫자값
        return 0;
    }
    // 곱셈(.)/나눗셈(..)/나머지(...)
    function parseFactor() {
        let node = parseAtom();
        while (peek() && peek().type === "op" && [".", "..", "..."].includes(peek().val)) {
            let op = consume().val; let right = parseAtom();
            if (op === ".")   node *= right;
            else if (op === "..") node = Math.floor(node / right);
            else              node %= right;
        }
        return node;
    }
    // 덧셈(,)/뺄셈(,,)
    function parseTerm() {
        let node = parseFactor();
        while (peek() && peek().type === "op" && [",", ",,"].includes(peek().val)) {
            let op = consume().val; let right = parseFactor();
            if (op === ",") node += right; else node -= right;
        }
        return node;
    }
    // 비교: 같음(~), 큼(;), 크거나같음(;;)
    function parseExpr() {
        let node = parseTerm();
        while (peek() && peek().type === "op" && ["~", ";", ";;"].includes(peek().val)) {
            let op = consume().val; let right = parseTerm();
            if      (op === "~")  node = node === right ? 1 : 0;
            else if (op === ";")  node = node > right   ? 1 : 0;
            else if (op === ";;") node = node >= right  ? 1 : 0;
        }
        return node;
    }
    return parseExpr();
}


// ════════════════════════════════════════════════════════
//  4. 채점용 코드 실행 함수
//
//  원본과의 차이:
//    - requestConsoleInput() 대신 inputLines 배열에서 순서대로 꺼냄
//    - printOut() 대신 outputBuffer 문자열에 누적
//    - DOM 조작 없음
//    - 무한루프 방지: 최대 스텝 수 제한 (100,000)
//
//  @param code  {string} 사용자가 작성한 그뭐냐 코드
//  @param input {string} stdin 입력값 (줄바꿈으로 구분)
//  @returns Promise<{ output: string, error: string }>
// ════════════════════════════════════════════════════════
async function runCode(code, input) {
    // ── 실행 환경 초기화 ──
    memory = {};                          // 메모리 초기화 (원본과 동일한 전역 변수)
    pc = 0;                               // 프로그램 카운터
    let outputBuffer = "";                // 출력 결과 누적
    let inputLines = input.split("\n");   // 입력값을 줄 단위로 분리
    let inputIndex = 0;                   // 다음에 꺼낼 입력 줄 인덱스
    let linesArr = code.split("\n");      // 코드를 줄 단위로 분리
    const MAX_STEPS = 100000;             // 무한루프 방지
    let stepCount = 0;

    try {
        // ── 메인 실행 루프 ──
        while (pc >= 0 && pc < linesArr.length && stepCount < MAX_STEPS) {
            stepCount++;

            // 현재 줄에서 주석 제거 후 앞뒤 공백 제거
            let fullLine = linesArr[pc].split("#")[0].trim();
            let jumped = false;

            if (fullLine) {
                // ── 명령어 처리 (원본 takeStep() 로직과 동일) ──

                if (fullLine.includes("뭐더라")) {
                    // 대입: "주소뭐더라 값" → memory[주소] = 값
                    let [m, e] = fullLine.split("뭐더라");
                    let targetAddr = resolveAddr(m.trim());
                    memory[targetAddr] = getVal(e.trim());
                }
                else if (fullLine.includes("진짜뭐지")) {
                    // 문자 입력: 입력값의 첫 글자를 ASCII 코드로 저장
                    let m = fullLine.replace("진짜뭐지", "").trim();
                    let targetAddr = resolveAddr(m);
                    // 원본의 requestConsoleInput() 대신 inputLines 배열에서 꺼냄
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "";
                    memory[targetAddr] = (val && val.length > 0) ? val.charCodeAt(0) : 0;
                }
                else if (fullLine.includes("진짜뭐냐")) {
                    // 문자 출력: 숫자값을 ASCII 문자로 변환하여 출력 (줄바꿈 없음)
                    outputBuffer += String.fromCharCode(getVal(fullLine.replace("진짜뭐냐", "")));
                }
                else if (fullLine.includes("뭐지")) {
                    // 숫자 입력: inputLines 배열에서 순서대로 꺼냄
                    let m = fullLine.replace("뭐지", "").trim();
                    let targetAddr = resolveAddr(m);
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "0";
                    memory[targetAddr] = parseInt(val) || 0;
                }
                else if (fullLine.includes("뭐냐")) {
                    // 숫자 출력: 값을 출력 버퍼에 추가 (줄바꿈 없음)
                    outputBuffer += String(getVal(fullLine.replace("뭐냐", "")));
                }
                else if (fullLine.includes("있잖아")) {
                    // 점프: 현재 pc에서 offset만큼 이동
                    let offset = getVal(fullLine.replace("있잖아", ""));
                    pc += offset;
                    jumped = true;
                }
            }

            if (!jumped) pc++;
        }

        // 무한루프 감지
        if (stepCount >= MAX_STEPS) {
            return { output: outputBuffer.trim(), error: "시간 초과: 명령어 실행 한도(" + MAX_STEPS + "회) 초과" };
        }

        return { output: outputBuffer.trim(), error: "" };

    } catch (err) {
        return { output: outputBuffer.trim(), error: "런타임 에러: " + err.message };
    }
}

// memory와 pc는 runCode 내에서 재초기화되지만
// getVal/resolveAddr가 참조하는 전역으로도 필요하므로 선언
var memory = {};
var pc = 0;


// ════════════════════════════════════════════════════════
//  5. 채점 진행
// ════════════════════════════════════════════════════════
async function startJudge() {
    if (!engineReady || isJudging) return;
    isJudging = true;

    var code  = monacoEditor.getValue();
    var tcs   = PROBLEM_1000.testCases;
    var total = tcs.length;

    var btn         = document.getElementById("submit-btn");
    var progressSec = document.getElementById("progress-section");
    var progressBar = document.getElementById("progress-bar");
    var progressTxt = document.getElementById("progress-text");
    var progressPct = document.getElementById("progress-pct");
    var tcResults   = document.getElementById("tc-results");
    var finalResult = document.getElementById("final-result");
    var errorLog    = document.getElementById("error-log");

    // UI 초기화
    btn.disabled = true;
    btn.textContent = "채점 중...";
    progressSec.style.display = "block";
    progressBar.style.width   = "0%";
    progressBar.style.background = "var(--accent-bright)";
    progressTxt.textContent = "채점 준비 중...";
    progressPct.textContent = "0%";
    progressPct.className   = "";
    tcResults.innerHTML     = "";
    finalResult.style.display = "none";
    finalResult.className   = "final-result";
    errorLog.style.display  = "none";

    // 테스트케이스 행 미리 생성
    for (var i = 0; i < total; i++) {
        var row = document.createElement("div");
        row.className = "tc-result-row";
        row.innerHTML =
            '<span class="tc-badge badge-pending" id="badge-' + i + '">대기중</span>' +
            '<span style="color:var(--muted)">테스트 ' + (i + 1) + '</span>';
        tcResults.appendChild(row);
    }

    // 순서대로 채점
    var allPassed     = true;
    var firstFailInfo = "";

    for (var i = 0; i < total; i++) {
        var tc    = tcs[i];
        var badge = document.getElementById("badge-" + i);

        badge.className   = "tc-badge badge-running";
        badge.textContent = "실행 중";
        progressTxt.textContent = "테스트 " + (i + 1) + " / " + total;

        var result = await runCode(code, tc.in);

        var pct = Math.round(((i + 1) / total) * 100);
        progressBar.style.width = pct + "%";
        progressPct.textContent = pct + "%";

        if (result.error) {
            badge.className   = "tc-badge badge-error";
            badge.textContent = "에러";
            allPassed = false;
            if (!firstFailInfo) {
                firstFailInfo = "[테스트 " + (i + 1) + "] 에러\n" + result.error;
            }
        } else if (result.output.trim() !== String(tc.out).trim()) {
            badge.className   = "tc-badge badge-fail";
            badge.textContent = "틀림";
            allPassed = false;
            if (!firstFailInfo) {
                firstFailInfo =
                    "[테스트 " + (i + 1) + "]\n" +
                    "입력:    " + tc.in + "\n" +
                    "정답:    " + tc.out + "\n" +
                    "내 출력: " + result.output;
            }
        } else {
            badge.className   = "tc-badge badge-pass";
            badge.textContent = "정답";
        }

        await sleep(120);
    }

    // 최종 결과
    if (allPassed) {
        progressBar.style.background = "var(--green)";
        progressPct.className        = "done-success";
        progressTxt.textContent      = "채점 완료";
        finalResult.style.display    = "block";
        finalResult.className        = "final-result success";
        finalResult.textContent      = "맞았습니다!! 🎉";
    } else {
        progressBar.style.background = "var(--red)";
        progressPct.className        = "done-fail";
        progressTxt.textContent      = "채점 완료";
        finalResult.style.display    = "block";
        finalResult.className        = "final-result fail";
        finalResult.textContent      = "틀렸습니다";
        errorLog.style.display       = "block";
        errorLog.textContent         = firstFailInfo;
    }

    btn.disabled    = false;
    btn.textContent = "다시 제출";
    isJudging       = false;
}


// ════════════════════════════════════════════════════════
//  6. 유틸
// ════════════════════════════════════════════════════════
function setStatus(state, text) {
    document.getElementById("status-dot").className    = "status-dot " + state;
    document.getElementById("status-text").textContent = text;
}

function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}
