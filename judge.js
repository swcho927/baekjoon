// ════════════════════════════════════════════════════════
//  judge.js  —  채점 엔진 및 UI 로직
//
//  ★ Pyodide → Skulpt 교체 이유:
//    - Pyodide: ~30MB CDN 다운로드 필요, Web Worker 안에서
//               importScripts로 재로드 → 느리고 환경에 따라 막힘
//    - Skulpt:  수백KB, <script> 태그로 이미 로드 완료,
//               즉시 사용 가능, 별도 Worker 불필요
//
//  ★ 나중에 친구분 JS 컴파일러로 교체할 때:
//    runCode() 함수 안의 Skulpt 부분만 바꾸면 됩니다.
// ════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────
//  전역 상태
// ────────────────────────────────────────────────────────
let monacoEditor = null;   // Monaco 에디터 인스턴스
let engineReady  = false;  // 채점 엔진 준비 완료 여부
let isJudging    = false;  // 현재 채점 진행 중 여부


// ════════════════════════════════════════════════════════
//  1. 초기화: Monaco 에디터 + Skulpt 엔진 로드
// ════════════════════════════════════════════════════════

// Monaco 에디터를 로드하는 함수
// require()는 Monaco CDN loader가 제공하는 비동기 모듈 로더
function initEditor(starterCode) {
    require.config({
        paths: {
            // Monaco의 핵심 파일들이 있는 CDN 경로
            vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs'
        }
    });

    require(['vs/editor/editor.main'], function () {
        // Monaco 에디터 생성
        monacoEditor = monaco.editor.create(
            document.getElementById('editor-container'),
            {
                value: starterCode,          // 처음에 보여줄 코드
                language: 'python',          // 문법 강조 언어
                theme: 'vs-dark',            // 다크 테마
                automaticLayout: true,       // 창 크기 바뀌면 자동 리사이즈
                fontSize: 15,
                minimap: { enabled: false }, // 미니맵 끄기
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
            }
        );

        // Monaco 로드 완료 후 Skulpt 엔진 확인
        initEngine();
    });
}

// Skulpt 엔진 준비 확인 함수
// Skulpt는 이미 <script> 태그로 로드했으므로
// Sk 전역 객체가 있는지만 확인하면 됩니다.
function initEngine() {
    // Sk 객체가 있으면 Skulpt 로드 성공
    if (typeof Sk !== 'undefined') {
        engineReady = true;
        setStatus('ready', '엔진 준비 완료');

        const btn = document.getElementById('submit-btn');
        btn.disabled = false;
        btn.textContent = '제출 및 채점';
    } else {
        // Sk가 없으면 로드 실패
        setStatus('error', '엔진 로드 실패 (새로고침 해주세요)');
    }
}


// ════════════════════════════════════════════════════════
//  2. 코드 실행 함수 (핵심!)
//
//  ★ 나중에 JS 컴파일러로 교체할 때 이 함수만 수정하면 됩니다.
//
//  @param {string} code   - 사용자가 작성한 코드
//  @param {string} input  - stdin으로 넣어줄 입력값
//  @returns {Promise<{output: string, error: string}>}
// ════════════════════════════════════════════════════════
function runCode(code, input) {
    return new Promise((resolve) => {

        // ── Skulpt 설정 ──────────────────────────────────
        // Skulpt는 Python을 JS로 변환해서 브라우저에서 실행합니다.
        // 실행 환경(stdin/stdout/stderr)을 아래에서 직접 설정합니다.

        let outputBuffer = '';  // print() 출력을 모을 버퍼
        let errorBuffer  = '';  // 에러 메시지를 모을 버퍼

        // stdin 입력을 줄 단위로 분리해서 순서대로 줌
        // readline()이 호출될 때마다 다음 줄을 반환
        const inputLines = input.split('\n');
        let inputIndex = 0;

        Sk.configure({
            // stdout 처리: print()가 호출되면 이 함수가 실행됨
            output: function (text) {
                outputBuffer += text;
            },

            // stdin 처리: input() 또는 sys.stdin.readline() 호출 시
            // ★ Skulpt의 readline은 Promise를 반환해야 비동기 입력을 지원
            read: function (filename) {
                // Skulpt 내부 파일(라이브러리) 요청 처리
                if (Sk.builtinFiles === undefined ||
                    Sk.builtinFiles.files[filename] === undefined) {
                    throw new Error("파일을 찾을 수 없습니다: " + filename);
                }
                return Sk.builtinFiles.files[filename];
            },

            // 비동기 readline: sys.stdin.readline() 지원
            inputfun: function () {
                // 남은 입력이 있으면 다음 줄 반환, 없으면 빈 문자열
                if (inputIndex < inputLines.length) {
                    return inputLines[inputIndex++];
                }
                return '';
            },

            // 비동기 모드: True = sys.stdin.readline() 같은 비동기 입력 지원
            __future__: Sk.python3,
        });

        // ── Python 코드 실행 ─────────────────────────────
        // Sk.misceval.asyncToPromise: 비동기 실행 후 Promise 반환
        const execution = Sk.misceval.asyncToPromise(function () {
            // Sk.importMainWithBody: 코드 문자열을 <stdin> 모듈로 실행
            return Sk.importMainWithBody('<stdin>', false, code, true);
        });

        // 실행 성공
        execution.then(function () {
            resolve({
                output: outputBuffer.trim(),
                error:  ''
            });
        });

        // 실행 실패 (런타임 에러, 문법 에러 등)
        execution.catch(function (err) {
            // Skulpt 에러 객체에서 메시지 추출
            const msg = err.toString ? err.toString() : String(err);
            resolve({
                output: outputBuffer.trim(),
                error:  msg
            });
        });
    });
}


// ════════════════════════════════════════════════════════
//  3. 채점 진행 함수
//  - 테스트케이스를 하나씩 실행하며 UI를 업데이트합니다.
// ════════════════════════════════════════════════════════
async function startJudge() {
    // 중복 실행 방지
    if (!engineReady || isJudging) return;
    isJudging = true;

    // 에디터에서 코드 가져오기
    const code = monacoEditor.getValue();

    // 현재 문제의 테스트케이스 (problems/1000.js에서 로드됨)
    const tcs = PROBLEM_1000.testCases;
    const total = tcs.length;

    // ── UI 초기화 ─────────────────────────────────────
    const btn         = document.getElementById('submit-btn');
    const progressSec = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressTxt = document.getElementById('progress-text');
    const progressPct = document.getElementById('progress-pct');
    const tcResults   = document.getElementById('tc-results');
    const finalResult = document.getElementById('final-result');
    const errorLog    = document.getElementById('error-log');

    btn.disabled = true;
    btn.textContent = '채점 중...';

    // 이전 결과 초기화
    progressSec.style.display = 'block';
    progressBar.style.width   = '0%';
    progressBar.style.background = 'var(--accent)'; // 기본 색: 노랑
    progressTxt.textContent = '채점 준비 중...';
    progressPct.textContent = '0%';
    tcResults.innerHTML = '';
    finalResult.style.display = 'none';
    finalResult.className = 'final-result';
    errorLog.style.display = 'none';

    // 테스트케이스 행 미리 만들기 (PENDING 상태로)
    // 나중에 결과가 나오면 이 행들을 업데이트
    const rows = [];
    for (let i = 0; i < total; i++) {
        const row = document.createElement('div');
        row.className = 'tc-result-row';
        row.innerHTML = `
            <span class="tc-badge badge-pending" id="badge-${i}">대기중</span>
            <span style="color:var(--muted); font-size:0.82rem;">테스트 ${i + 1}</span>
        `;
        tcResults.appendChild(row);
        rows.push(row);
    }

    // ── 테스트케이스 순서대로 실행 ───────────────────
    let allPassed = true;
    let firstFailIndex = -1;
    let firstFailDetail = '';

    for (let i = 0; i < total; i++) {
        const tc = tcs[i];

        // 현재 실행 중인 테스트케이스 표시
        document.getElementById(`badge-${i}`).className = 'tc-badge badge-running';
        document.getElementById(`badge-${i}`).textContent = '실행 중';
        progressTxt.textContent = `테스트 ${i + 1} / ${total} 채점 중...`;

        // 코드 실행 (Skulpt)
        const result = await runCode(code, tc.in);

        // 진행률 계산 및 표시
        const pct = Math.round(((i + 1) / total) * 100);
        progressBar.style.width = pct + '%';
        progressPct.textContent = pct + '%';

        // 결과 판정
        const badge = document.getElementById(`badge-${i}`);

        if (result.error) {
            // ── 런타임/문법 에러 ──
            badge.className = 'tc-badge badge-error';
            badge.textContent = '에러';
            allPassed = false;
            if (firstFailIndex === -1) {
                firstFailIndex = i;
                firstFailDetail = `[테스트 ${i+1}] 런타임 에러\n${result.error}`;
            }
        } else if (result.output.trim() !== tc.out.trim()) {
            // ── 오답 ──
            badge.className = 'tc-badge badge-fail';
            badge.textContent = '틀림';
            allPassed = false;
            if (firstFailIndex === -1) {
                firstFailIndex = i;
                firstFailDetail = `[테스트 ${i+1}]\n입력:   ${tc.in}\n정답:   ${tc.out}\n내 출력: ${result.output}`;
            }
        } else {
            // ── 정답 ──
            badge.className = 'tc-badge badge-pass';
            badge.textContent = '정답';
        }

        // 살짝 딜레이: 채점 과정이 눈에 보이도록
        // (너무 빠르면 화면이 한번에 바뀌어서 진행 느낌이 안 남)
        await sleep(120);
    }

    // ── 최종 결과 표시 ────────────────────────────────
    if (allPassed) {
        progressBar.style.background = 'var(--green)';
        progressTxt.textContent = '채점 완료';

        finalResult.style.display = 'block';
        finalResult.className = 'final-result success';
        finalResult.textContent = '맞았습니다!! 🎉';
    } else {
        progressBar.style.background = 'var(--red)';
        progressTxt.textContent = '채점 완료';

        finalResult.style.display = 'block';
        finalResult.className = 'final-result fail';
        finalResult.textContent = '틀렸습니다';

        // 첫 번째 실패 케이스 상세 정보
        errorLog.style.display = 'block';
        errorLog.textContent = firstFailDetail;
    }

    // 버튼 복구
    btn.disabled = false;
    btn.textContent = '다시 제출';
    isJudging = false;
}


// ════════════════════════════════════════════════════════
//  4. 유틸리티 함수들
// ════════════════════════════════════════════════════════

// 네비게이션 상태 표시 업데이트
// @param {string} state - 'loading' | 'ready' | 'error'
// @param {string} text  - 표시할 텍스트
function setStatus(state, text) {
    const dot  = document.getElementById('status-dot');
    const span = document.getElementById('status-text');
    dot.className  = 'status-dot ' + state; // CSS 클래스로 색상 변경
    span.textContent = text;
}

// ms 밀리초 동안 기다리는 함수
// async/await에서 사용: await sleep(200)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
