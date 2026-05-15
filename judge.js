// ════════════════════════════════════════════════════════
//  judge.js  ─  '그 뭐냐' 언어 전용 채점 엔진 + UI 로직
// ════════════════════════════════════════════════════════

var monacoEditor = null;
var engineReady  = false;
var isJudging    = false;

// 임시 테스트 케이스 (실제 환경에 맞게 PROBLEM_1000 등으로 교체 가능)
var PROBLEM_1000 = {
    testCases: [
        { in: "1 2", out: "3" },
        { in: "10 20", out: "30" }
    ]
};

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
                value: starterCode || "// '그 뭐냐' 코드를 작성하세요\n",
                language: "javascript", // 하이라이팅용
                theme: "vs-dark",
                automaticLayout: true,
                fontSize: 15,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
            }
        );
        // 에디터 로드 후 내장 JS 엔진이므로 즉시 준비 완료 처리
        initEngine();
    });
}

// ════════════════════════════════════════════════════════
//  2. 엔진 초기화 (JS 내장형)
// ════════════════════════════════════════════════════════
function initEngine() {
    engineReady = true;
    setStatus("ready", "그 뭐냐 엔진 준비 완료");
    var btn = document.getElementById("submit-btn");
    if (btn) {
        btn.disabled = false;
        btn.textContent = "제출 및 채점";
    }
}

// ════════════════════════════════════════════════════════
//  3. 🔥 '그 뭐냐' 언어 채점용 실행 엔진 🔥
//     입력창 띄우지 않고 tc.in 값을 자동으로 빨아들입니다.
// ════════════════════════════════════════════════════════
async function runCode(code, input) {
    let linesArr = code.split('\n');
    let pc = 0;
    
    // 채점을 위한 독립적인 메모리와 환경 세팅
    let tempMemory = {}; 
    let outputBuffer = ""; 
    
    // 입력값을 공백이나 줄바꿈 기준으로 쪼개어 큐(Queue)처럼 준비해둡니다.
    let inputTokens = input.trim().split(/\s+/);
    let inputCursor = 0;

    // 무한 루프 방지 (서버/브라우저가 뻗는 걸 막기 위해)
    let steps = 0;
    const MAX_STEPS = 100000;

    try {
        while (pc >= 0 && pc < linesArr.length) {
            if (steps++ > MAX_STEPS) {
                throw new Error("Time Limit Exceeded (무한루프 의심)");
            }

            let fullLine = linesArr[pc].split('#')[0].trim();
            let jumped = false;

            if (fullLine) {
                if (fullLine.includes("뭐더라")) { 
                    let [m, e] = fullLine.split("뭐더라"); 
                    let targetAddr = resolveAddr(m.trim());
                    tempMemory[targetAddr] = getVal(e.trim(), tempMemory); 
                }
                else if (fullLine.includes("진짜뭐지")) { 
                    // [변경] 입력창 대신 테스트케이스(inputTokens)에서 문자를 꺼내옵니다.
                    let m = fullLine.replace("진짜뭐지", "").trim(); 
                    let targetAddr = resolveAddr(m);
                    let val = inputTokens[inputCursor++] || "";
                    tempMemory[targetAddr] = (val && val.length > 0) ? val.charCodeAt(0) : 0; 
                }
                else if (fullLine.includes("진짜뭐냐")) { 
                    // [변경] 화면 출력이 아닌 outputBuffer에 누적합니다.
                    let val = getVal(fullLine.replace("진짜뭐냐", ""), tempMemory);
                    outputBuffer += String.fromCharCode(val); 
                }
                else if (fullLine.includes("뭐지")) { 
                    // [변경] 입력창 대신 테스트케이스(inputTokens)에서 숫자를 꺼내옵니다.
                    let m = fullLine.replace("뭐지", "").trim(); 
                    let targetAddr = resolveAddr(m);
                    let val = inputTokens[inputCursor++] || "0";
                    tempMemory[targetAddr] = parseInt(val) || 0; 
                }
                else if (fullLine.includes("뭐냐")) { 
                    // [변경] 화면 출력이 아닌 outputBuffer에 누적합니다.
                    let val = getVal(fullLine.replace("뭐냐", ""), tempMemory);
                    outputBuffer += val.toString(); 
                }
                else if (fullLine.includes("있잖아")) { 
                    let offset = getVal(fullLine.replace("있잖아", ""), tempMemory); 
                    pc += offset; jumped = true; 
                }
            }
            
            if (!jumped) pc++;
        }
    } catch (err) {
        return { output: outputBuffer, error: err.message };
    }

    // 채점기가 비교할 수 있게 최종 출력 문자열 반환
    return { output: outputBuffer, error: null };
}

// ════════════════════════════════════════════════════════
//  4. 채점 시작
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

    for (var i = 0; i < total; i++) {
        var row = document.createElement("div");
        row.className = "tc-result-row";
        row.innerHTML =
            '<span class="tc-badge badge-pending" id="badge-' + i + '">대기중</span>' +
            '<span style="color:var(--muted)">테스트 ' + (i + 1) + '</span>';
        tcResults.appendChild(row);
    }

    var allPassed      = true;
    var firstFailInfo  = "";

    for (var i = 0; i < total; i++) {
        var tc    = tcs[i];
        var badge = document.getElementById("badge-" + i);

        badge.className   = "tc-badge badge-running";
        badge.textContent = "실행 중";
        progressTxt.textContent = "테스트 " + (i + 1) + " / " + total;

        // 엔진 실행 대기
        var result = await runCode(code, tc.in);

        var pct = Math.round(((i + 1) / total) * 100);
        progressBar.style.width = pct + "%";
        progressPct.textContent = pct + "%";

        if (result.error) {
            badge.className   = "tc-badge badge-error";
            badge.textContent = "에러";
            allPassed = false;
            if (!firstFailInfo) firstFailInfo = "[테스트 " + (i+1) + "] 런타임 에러\n" + result.error;
        } else if (result.output.trim() !== tc.out.trim()) {
            badge.className   = "tc-badge badge-fail";
            badge.textContent = "틀림";
            allPassed = false;
            if (!firstFailInfo) {
                firstFailInfo =
                    "[테스트 " + (i+1) + "]\n" +
                    "입력:    " + tc.in + "\n" +
                    "정답:    " + tc.out + "\n" +
                    "내 출력: " + result.output;
            }
        } else {
            badge.className   = "tc-badge badge-pass";
            badge.textContent = "정답";
        }

        await sleep(100);
    }

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
//  5. 유틸 함수
// ════════════════════════════════════════════════════════
function setStatus(state, text) {
    var dot = document.getElementById("status-dot");
    var txt = document.getElementById("status-text");
    if(dot) dot.className = "status-dot " + state;
    if(txt) txt.textContent = text;
}

function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}

// ⚠️ [중요] 디렉터님의 원래 코드에 있던 resolveAddr, getVal 함수가 
// judge.js 어딘가에 존재해야 합니다. 만약 없다면 아래처럼 더미 함수를 실제에 맞게 채워주세요.
function resolveAddr(str) {
    // 예: 'A' -> 0, 'B' -> 1 
    return str; 
}
function getVal(str, memoryObj) {
    // 예: 변수면 memoryObj에서 꺼내고, 숫자면 parseInt
    return parseInt(str) || memoryObj[str] || 0;
}
