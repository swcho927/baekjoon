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
//    4. 초기화 (페이지 로드 시 테스트케이스 개수 표시 + 기본 코드 삽입)
// ════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════
//  1. 그뭐냐 인터프리터 핵심 로직
// ════════════════════════════════════════════════════════

var memory = {};
var pc = 0;

// ── 주소 해결기 ──
// "거" 앞부분을 수식으로 계산해서 주소를 결정
// 예: "그그거"  → getVal("그그") = 2 → 2번 주소
//     "아그그,,그어거" → getVal("아그그,,그어") = 2-1 = 1 → 1번 주소
//     "그거거"  → getVal("그거") = memory[1] → memory[1]번 주소 (포인터)
function resolveAddr(memStr) {
    // "거"가 없으면 그냥 수식으로 계산
    var geoIdx = memStr.indexOf("거");
    if (geoIdx === -1) return getVal(memStr);

    // "거" 앞부분을 수식으로 계산 → 그게 기본 주소
    var before = memStr.slice(0, geoIdx);
    var addr   = getVal(before);

    // "거" 뒷부분이 남아있으면 포인터 역참조
    var after = memStr.slice(geoIdx + 1);
    if (after.length > 0) {
        addr = memory[addr] || 0;
        // 뒷부분에 또 "거"가 있으면 재귀적으로 처리
        addr = resolveAddr(after.replace(/^거*/, function(m) {
            var result = addr;
            for (var i = 0; i < m.length; i++) result = memory[result] || 0;
            return "";
        }));
    } else {
        addr = memory[addr] || 0;
    }

    return addr;
}

// ── 토크나이저 ──
// resolveAddr 호출 제거 (순환 참조 방지)
function tokenizeLine(text) {
    const regex = /(#.*)|(그+거+)|(그+)|(진짜뭐지|진짜뭐냐|뭐더라|뭐지|뭐냐|있잖아)|(아|어)|(\.\.\.|\.\.|\.|,,|,|;;|;|~)/g;
    let tokens = [];
    let lastIdx = 0;

    text.replace(regex, (match, comm, mem, num, cmd, bracket, op, offset) => {
        if (offset > lastIdx) tokens.push({ type: 'text',    val: text.slice(lastIdx, offset) });
        if      (comm)    tokens.push({ type: 'comment', val: comm });
        else if (mem)     tokens.push({ type: 'mem',     val: mem });
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
function getVal(expr) {
    const toks = tokenizeLine(expr).filter(t => t.type !== 'text' && t.type !== 'comment');
    if (toks.length === 0) return 0;
    let pos = 0;
    const consume = () => toks[pos++];
    const peek    = () => toks[pos];

    function parseAtom() {
        let t = consume(); if (!t) return 0;
        if (t.type === 'bracket' && t.val === '아') { let res = parseExpr(); consume(); return res; }
        if (t.type === 'mem') return memory[resolveAddr(t.val)] || 0;
        if (t.type === 'num') return t.val.length;
        return 0;
    }
    function parseFactor() {
        let node = parseAtom();
        while (peek() && peek().type === 'op' && ['.', '..', '...'].includes(peek().val)) {
            let op = consume().val, right = parseAtom();
            if (op === '.')        node *= right;
            else if (op === '..') node = Math.floor(node / right);
            else                  node %= right;
        }
        return node;
    }
    function parseTerm() {
        let node = parseFactor();
        while (peek() && peek().type === 'op' && [',', ',,'].includes(peek().val)) {
            let op = consume().val, right = parseFactor();
            node = op === ',' ? node + right : node - right;
        }
        return node;
    }
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
function runCode(code, input, timeLimitMs, memLimitMB) {
    memory = {};
    pc = 0;
    let outputBuffer = "";
    let inputLines   = input.split("\n");
    let inputIndex   = 0;
    let linesArr     = code.split("\n");
    const memLimitBytes = memLimitMB * 1024 * 1024;
    const startTime     = Date.now();

    try {
        while (pc >= 0 && pc < linesArr.length) {
            if (Date.now() - startTime > timeLimitMs) {
                return { output: outputBuffer.trim(), verdict: "TLE" };
            }
            if (Object.keys(memory).length * 8 > memLimitBytes) {
                return { output: outputBuffer.trim(), verdict: "MLE" };
            }

            let fullLine = linesArr[pc].split('#')[0].trim();
            let jumped   = false;

            if (fullLine) {
                if (fullLine.includes("뭐더라")) {
                    let [m, e] = fullLine.split("뭐더라");
                    memory[resolveAddr(m.trim())] = getVal(e.trim());
                }
                else if (fullLine.includes("진짜뭐지")) {
                    let targetAddr = resolveAddr(fullLine.replace("진짜뭐지", "").trim());
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "";
                    memory[targetAddr] = (val && val.length > 0) ? val.charCodeAt(0) : 0;
                }
                else if (fullLine.includes("진짜뭐냐")) {
                    outputBuffer += String.fromCharCode(getVal(fullLine.replace("진짜뭐냐", "")));
                }
                else if (fullLine.includes("뭐지")) {
                    let targetAddr = resolveAddr(fullLine.replace("뭐지", "").trim());
                    let val = inputIndex < inputLines.length ? inputLines[inputIndex++] : "0";
                    memory[targetAddr] = parseInt(val) || 0;
                }
                else if (fullLine.includes("뭐냐")) {
                    outputBuffer += String(getVal(fullLine.replace("뭐냐", "")));
                }
                else if (fullLine.includes("있잖아")) {
                    pc += getVal(fullLine.replace("있잖아", ""));
                    jumped = true;
                }
            }

            if (!jumped) pc++;
        }

        return { output: outputBuffer.trim(), verdict: "AC" };

    } catch (err) {
        return { output: outputBuffer.trim(), verdict: "RE: " + err.message };
    }
}


// ════════════════════════════════════════════════════════
//  2. 채점 UI 제어
// ════════════════════════════════════════════════════════
var isJudging = false;

async function submitCode(probId) {
    if (isJudging) return;

    var prob = window.PROBLEMS[probId];
    if (!prob) { alert("문제 데이터를 찾을 수 없습니다: " + probId); return; }

    var code = document.getElementById("editor-" + probId).value.trim();
    if (!code) { alert("코드를 입력해주세요."); return; }

    var tcs         = prob.testCases;
    var total       = tcs.length;
    var timeLimitMs = prob.timeLimit * 1000;
    var memLimitMB  = prob.memoryLimit;

    var btn          = document.getElementById("sBtn-"         + probId);
    var progressWrap = document.getElementById("progressWrap-" + probId);
    var progressFill = document.getElementById("progressFill-" + probId);
    var progressNum  = document.getElementById("progressNum-"  + probId);
    var progressText = document.getElementById("progressText-" + probId);
    var resultBox    = document.getElementById("resultBox-"    + probId);
    var errorLog     = document.getElementById("errorLog-"     + probId);

    // ── UI 초기화 ──
    isJudging = true;
    btn.disabled    = true;
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
    for (var i = 0; i < total; i++) {
        var tc     = tcs[i];
        var result = runCode(code, tc.in, timeLimitMs, memLimitMB);
        var pct    = Math.round(((i + 1) / total) * 100);

        progressNum.textContent  = (i + 1) + " / " + total;
        progressFill.style.width = pct + "%";
        progressText.textContent = pct + "%";

        var verdict = result.verdict;
        var failed  = verdict !== "AC";
        var failMsg = "";

        if (verdict === "TLE") {
            failMsg = "[테스트 " + (i+1) + "] 시간 초과";
        } else if (verdict === "MLE") {
            failMsg = "[테스트 " + (i+1) + "] 메모리 초과";
        } else if (verdict.startsWith("RE")) {
            failMsg = "[테스트 " + (i+1) + "] 런타임 에러\n" + verdict.slice(4);
        } else if (result.output.trim() !== String(tc.out).trim()) {
            failed  = true;
            failMsg =
                "[테스트 " + (i+1) + "] 틀렸습니다\n" +
                "입력:    " + tc.in.replace(/\n/g, " / ") + "\n" +
                "정답:    " + tc.out + "\n" +
                "내 출력: " + result.output;
        }

        await new Promise(function(r) { setTimeout(r, 80); });

        if (failed) {
            progressFill.style.background = "var(--red)";
            resultBox.style.display = "block";
            resultBox.className     = "result-display res-fail";
            resultBox.textContent   = failMsg.split("\n")[0];
            errorLog.style.display  = "block";
            errorLog.textContent    = failMsg;
            btn.disabled    = false;
            btn.textContent = "다시 제출";
            isJudging       = false;
            return;
        }
    }

    // ── 전부 통과 ──
    progressFill.style.background = "var(--green)";
    resultBox.style.display = "block";
    resultBox.className     = "result-display res-success";
    resultBox.textContent   = "맞았습니다!! 🎉";

    btn.disabled    = false;
    btn.textContent = "다시 제출";
    isJudging       = false;
}


// ════════════════════════════════════════════════════════
//  3. 탭 전환
// ════════════════════════════════════════════════════════
function switchProblem(probId) {
    document.querySelectorAll('.prob-page').forEach(function(el) {
        el.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-item').forEach(function(el) {
        el.classList.remove('active');
    });

    var page = document.getElementById("page-"  + probId);
    var tab  = document.getElementById("tab-"   + probId);
    if (page) page.classList.add('active');
    if (tab)  tab.classList.add('active');
}


// ════════════════════════════════════════════════════════
//  4. 페이지 로드 시 초기화
//     - 테스트케이스 개수 표시
//     - 기본 코드 textarea에 삽입
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    Object.keys(window.PROBLEMS).forEach(function(probId) {
        var prob = window.PROBLEMS[probId];

        // 테스트케이스 개수 표시
        var tcEl = document.getElementById("tcCount-" + probId);
        if (tcEl) tcEl.textContent = prob.testCases.length + "개";

        // 기본 코드 삽입
        var editorEl = document.getElementById("editor-" + probId);
        if (editorEl && prob.defaultCode && editorEl.value.trim() === "") {
            editorEl.value = prob.defaultCode;
        }
    });
});
