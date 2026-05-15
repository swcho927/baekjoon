// ════════════════════════════════════════════════════════
//  judge.js  ─  채점 엔진 + UI 로직
//
//  ★ 나중에 친구분 JS 컴파일러로 교체할 때:
//    runCode() 함수 안의 Skulpt 부분만 바꾸면 됩니다.
// ════════════════════════════════════════════════════════

var monacoEditor = null;  // Monaco 에디터 인스턴스
var engineReady  = false; // 엔진 준비 완료 여부
var isJudging    = false; // 채점 진행 중 여부


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
                language: "python",
                theme: "vs-dark",
                automaticLayout: true,
                fontSize: 15,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
            }
        );
        // Monaco 로드 완료 후 Skulpt 엔진 확인
        initEngine();
    });
}


// ════════════════════════════════════════════════════════
//  2. Skulpt 엔진 확인
//     <script> 태그로 이미 로드했으므로 Sk 객체 존재 여부만 확인
// ════════════════════════════════════════════════════════
function initEngine() {
    if (typeof Sk !== "undefined") {
        // Skulpt 로드 성공
        engineReady = true;
        setStatus("ready", "엔진 준비 완료");
        var btn = document.getElementById("submit-btn");
        btn.disabled = false;
        btn.textContent = "제출 및 채점";
    } else {
        // Skulpt 로드 실패
        setStatus("error", "엔진 로드 실패 — 새로고침 해주세요");
    }
}


// ════════════════════════════════════════════════════════
//  3. Python 코드 실행
//
//  ★ 나중에 JS 컴파일러로 교체할 때 이 함수만 수정
//
//  @param code  {string} 사용자 코드
//  @param input {string} stdin 입력값
//  @returns Promise<{ output: string, error: string }>
// ════════════════════════════════════════════════════════
function runCode(code, input) {
    return new Promise(function (resolve) {
        var outputBuffer = "";  // print() 출력 모을 버퍼
        var inputLines   = input.split("\n"); // 줄 단위로 입력 분리
        var inputIndex   = 0;

        Sk.configure({
            // print() 호출 시 출력을 버퍼에 저장
            output: function (text) {
                outputBuffer += text;
            },
            // sys, io 등 내장 파일 읽기
            read: function (filename) {
                if (Sk.builtinFiles === undefined ||
                    Sk.builtinFiles.files[filename] === undefined) {
                    throw new Error("파일 없음: " + filename);
                }
                return Sk.builtinFiles.files[filename];
            },
            // sys.stdin.readline() 호출 시 다음 줄 반환
            inputfun: function () {
                if (inputIndex < inputLines.length) {
                    return inputLines[inputIndex++];
                }
                return "";
            },
            __future__: Sk.python3,
        });

        // 코드 실행 (비동기 Promise 방식)
        var exec = Sk.misceval.asyncToPromise(function () {
            return Sk.importMainWithBody("<stdin>", false, code, true);
        });

        // 실행 성공
        exec.then(function () {
            resolve({ output: outputBuffer.trim(), error: "" });
        });

        // 실행 실패 (문법 에러, 런타임 에러 등)
        exec.catch(function (err) {
            resolve({ output: outputBuffer.trim(), error: err.toString() });
        });
    });
}


// ════════════════════════════════════════════════════════
//  4. 채점 시작
//     테스트케이스를 순서대로 실행하며 UI 업데이트
// ════════════════════════════════════════════════════════
async function startJudge() {
    if (!engineReady || isJudging) return;
    isJudging = true;

    var code  = monacoEditor.getValue();
    var tcs   = PROBLEM_1000.testCases;
    var total = tcs.length;

    // DOM 요소 참조
    var btn         = document.getElementById("submit-btn");
    var progressSec = document.getElementById("progress-section");
    var progressBar = document.getElementById("progress-bar");
    var progressTxt = document.getElementById("progress-text");
    var progressPct = document.getElementById("progress-pct");
    var tcResults   = document.getElementById("tc-results");
    var finalResult = document.getElementById("final-result");
    var errorLog    = document.getElementById("error-log");

    // ── UI 초기화 ──
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

    // 테스트케이스 행 미리 생성 (PENDING 상태)
    for (var i = 0; i < total; i++) {
        var row = document.createElement("div");
        row.className = "tc-result-row";
        row.innerHTML =
            '<span class="tc-badge badge-pending" id="badge-' + i + '">대기중</span>' +
            '<span style="color:var(--muted)">테스트 ' + (i + 1) + '</span>';
        tcResults.appendChild(row);
    }

    // ── 테스트케이스 순서대로 실행 ──
    var allPassed      = true;
    var firstFailInfo  = "";

    for (var i = 0; i < total; i++) {
        var tc    = tcs[i];
        var badge = document.getElementById("badge-" + i);

        // 현재 케이스 실행 중 표시
        badge.className   = "tc-badge badge-running";
        badge.textContent = "실행 중";
        progressTxt.textContent = "테스트 " + (i + 1) + " / " + total;

        // 코드 실행
        var result = await runCode(code, tc.in);

        // 진행률 업데이트
        var pct = Math.round(((i + 1) / total) * 100);
        progressBar.style.width = pct + "%";
        progressPct.textContent = pct + "%";

        if (result.error) {
            // 에러
            badge.className   = "tc-badge badge-error";
            badge.textContent = "에러";
            allPassed = false;
            if (!firstFailInfo) {
                firstFailInfo = "[테스트 " + (i+1) + "] 런타임 에러\n" + result.error;
            }
        } else if (result.output.trim() !== tc.out.trim()) {
            // 오답
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
            // 정답
            badge.className   = "tc-badge badge-pass";
            badge.textContent = "정답";
        }

        // 채점 과정이 눈에 보이도록 약간 대기
        await sleep(120);
    }

    // ── 최종 결과 표시 ──
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

// 네비바 상태 표시 업데이트
function setStatus(state, text) {
    document.getElementById("status-dot").className  = "status-dot " + state;
    document.getElementById("status-text").textContent = text;
}

// ms 밀리초 대기
function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}
