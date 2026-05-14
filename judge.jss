// ═══════════════════════════════════════════════════════
//  judge.js  —  Pyodide Worker + 채점 공통 로직
//
//  의존: 각 problems/*.js 가 window.PROBLEMS 에 등록한 뒤
//        initJudge() 를 호출해야 함
// ═══════════════════════════════════════════════════════

// ── 공통 유틸 ────────────────────────────────────────────
function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        return s / 0x100000000;
    };
}

// ── Pyodide Worker ────────────────────────────────────────
const WORKER_SRC = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");
let pyodide;
async function load() { pyodide = await loadPyodide(); postMessage({ type: 'ready' }); }
self.onmessage = async (e) => {
    const { id, code, input } = e.data;
    try {
        pyodide.globals.set("user_code", code);
        pyodide.globals.set("input_data", input);
        const w = \`
import sys, io, traceback
class MockStdin:
    def __init__(self, d): self.lines = d.splitlines(True); self.idx = 0
    def readline(self):
        if self.idx < len(self.lines):
            r = self.lines[self.idx]; self.idx += 1; return r
        return ""
    def read(self):
        r = "".join(self.lines[self.idx:]); self.idx = len(self.lines); return r
sys.stdin  = MockStdin(input_data)
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
try:
    exec(user_code, {'__name__': '__main__'})
except Exception:
    traceback.print_exc(file=sys.stderr)
[sys.stdout.getvalue(), sys.stderr.getvalue()]
\`;
        const res = await pyodide.runPythonAsync(w);
        postMessage({ id, out: res.toJs()[0].trim(), err: res.toJs()[1].trim() });
    } catch (err) {
        postMessage({ id, error: err.message });
    }
};
load();
`;

const pyodideWorker = new Worker(
    URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' }))
);
let pyodideReady = false;

pyodideWorker.onmessage = (e) => {
    if (e.data.type === 'ready') {
        pyodideReady = true;
        // 등록된 모든 문제의 버튼 활성화
        document.querySelectorAll('.btn-submit').forEach(btn => {
            btn.innerText  = '제출 및 채점 시작';
            btn.disabled   = false;
        });
    }
};

function runInWorker(code, input) {
    return new Promise(resolve => {
        const id = Math.random().toString(36).substr(2, 9);
        const handler = (e) => {
            if (e.data.id === id) {
                pyodideWorker.removeEventListener('message', handler);
                resolve(e.data);
            }
        };
        pyodideWorker.addEventListener('message', handler);
        pyodideWorker.postMessage({ id, code, input });
    });
}

// ── 채점 루프 ─────────────────────────────────────────────
async function submitCode(prob) {
    if (!pyodideReady) return;

    const problem = window.PROBLEMS[prob];
    const resBox  = document.getElementById(`resultBox-${prob}`);
    const errLog  = document.getElementById(`errorLog-${prob}`);
    const btn     = document.getElementById(`sBtn-${prob}`);
    const code    = problem.editor.getValue();
    const tcList  = problem.testCases;

    resBox.style.display = 'block';
    resBox.className     = 'result-display res-judging';
    errLog.style.display = 'none';
    btn.disabled         = true;

    for (let i = 0; i < tcList.length; i++) {
        resBox.innerText = `채점 중 (${Math.floor(i / tcList.length * 100)}%) — ${i + 1}/${tcList.length}`;
        const res = await runInWorker(code, tcList[i].in);

        if (res.error || res.err) {
            resBox.innerText  = '런타임 에러';
            resBox.className  = 'result-display res-fail';
            errLog.style.display = 'block';
            errLog.innerText  = `케이스 ${i + 1} 런타임 에러\n\n${res.error || res.err}`;
            btn.disabled = false;
            return;
        }
        if (res.out !== tcList[i].out) {
            resBox.innerText  = '틀렸습니다';
            resBox.className  = 'result-display res-fail';
            errLog.style.display = 'block';
            const preview = tcList[i].in.length > 300
                ? tcList[i].in.slice(0, 300) + '\n...(생략)'
                : tcList[i].in;
            errLog.innerText = `케이스 ${i + 1} 실패\n기댓값: ${tcList[i].out}\n실제값: ${res.out}\n\n입력 미리보기:\n${preview}`;
            btn.disabled = false;
            return;
        }
    }

    resBox.innerText = '맞았습니다!!';
    resBox.className = 'result-display res-success';
    btn.disabled = false;
}

// ── 탭 전환 ───────────────────────────────────────────────
function switchProblem(prob) {
    const problem = window.PROBLEMS[prob];

    // 배낭처럼 지연 생성이 필요한 에디터: 페이지 보인 뒤 생성
    if (!problem.editorCreated) {
        document.querySelectorAll('.prob-page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link-prob').forEach(a => a.classList.remove('active'));
        document.getElementById(`page-${prob}`).classList.add('active');
        document.getElementById(`tab-${prob}`).classList.add('active');

        requestAnimationFrame(() => {
            problem.editor = monaco.editor.create(
                document.getElementById(`editor-${prob}`),
                {
                    value: problem.defaultCode,
                    language: 'python',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    fontSize: 16,
                    fontFamily: 'JetBrains Mono'
                }
            );
            problem.editorCreated = true;
            // Worker 준비됐으면 버튼도 바로 활성화
            if (pyodideReady) {
                document.getElementById(`sBtn-${prob}`).innerText  = '제출 및 채점 시작';
                document.getElementById(`sBtn-${prob}`).disabled   = false;
            }
        });
        return;
    }

    document.querySelectorAll('.prob-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link-prob').forEach(a => a.classList.remove('active'));
    document.getElementById(`page-${prob}`).classList.add('active');
    document.getElementById(`tab-${prob}`).classList.add('active');

    requestAnimationFrame(() => {
        if (problem.editor) problem.editor.layout();
    });
}

// ── 초기화 ────────────────────────────────────────────────
// 첫 번째 탭(토마토)은 페이지 로드 시 바로 에디터 생성
function initJudge() {
    const firstProb = Object.keys(window.PROBLEMS)[0];
    const first     = window.PROBLEMS[firstProb];

    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        first.editor = monaco.editor.create(
            document.getElementById(`editor-${firstProb}`),
            {
                value: first.defaultCode,
                language: 'python',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 16,
                fontFamily: 'JetBrains Mono'
            }
        );
        first.editorCreated = true;
    });

    // 나머지 문제 TC 생성
    Object.entries(window.PROBLEMS).forEach(([key, prob]) => {
        prob.generateTC();
    });
}
