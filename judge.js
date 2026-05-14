let pyodideWorker;
let isReady = false;

const testCases = [
    { in: "1 2", out: "3" },
    { in: "10 20", out: "30" },
    { in: "100 200", out: "300" },
    { in: "0 0", out: "0" },
    { in: "-5 5", out: "0" }
];

function initPythonEngine() {
    const workerCode = `
        importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");
        let pyodide;
        async function load() {
            try {
                pyodide = await loadPyodide();
                postMessage({ type: 'ready' });
            } catch (e) {
                postMessage({ type: 'error', error: e.message });
            }
        }
        self.onmessage = async (e) => {
            const { id, code, input } = e.data;
            try {
                pyodide.globals.set("user_code", code);
                pyodide.globals.set("input_data", input);
                const wrapper = \`
import sys, io
class MockStdin:
    def __init__(self, d): self.lines = d.splitlines(True); self.idx = 0
    def readline(self):
        if self.idx < len(self.lines):
            res = self.lines[self.idx]; self.idx += 1; return res
        return ""
sys.stdin = MockStdin(input_data)
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
try:
    exec(user_code, {'__name__': '__main__'})
except Exception as e:
    import traceback
    traceback.print_exc(file=sys.stderr)
[sys.stdout.getvalue().strip(), sys.stderr.getvalue().strip()]
\`;
                const resList = await pyodide.runPythonAsync(wrapper);
                postMessage({ id, out: resList.toJs()[0], err: resList.toJs()[1] });
            } catch(err) { postMessage({ id, error: err.message }); }
        };
        load();
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    pyodideWorker = new Worker(URL.createObjectURL(blob));
    
    pyodideWorker.onmessage = (e) => {
        if (e.data.type === 'ready') {
            isReady = true;
            const btn = document.getElementById('sBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerText = "제출 및 채점 시작";
            }
        } else if (e.data.type === 'error') {
            console.error("Pyodide 로드 실패:", e.data.error);
        }
    };
}

async function runJudge(userCode) {
    if (!isReady) return;

    const resBox = document.getElementById('resultBox');
    const errLog = document.getElementById('errorLog');
    const btn = document.getElementById('sBtn');

    resBox.style.display = 'block';
    resBox.innerText = "채점 중...";
    resBox.className = "result-display judging";
    errLog.style.display = 'none';
    btn.disabled = true;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const res = await new Promise(resolve => {
            const id = Math.random().toString(36).substr(2, 9);
            const handler = (e) => {
                if (e.data.id === id) {
                    pyodideWorker.removeEventListener('message', handler);
                    resolve(e.data);
                }
            };
            pyodideWorker.addEventListener('message', handler);
            pyodideWorker.postMessage({ id, code: userCode, input: tc.in });
        });

        if (res.error || (res.err && res.err.length > 0)) {
            showResult("런타임 에러", "fail");
            errLog.style.display = 'block';
            errLog.innerText = res.error || res.err;
            btn.disabled = false; return;
        }

        if (String(res.out).trim() !== String(tc.out).trim()) {
            showResult(`틀렸습니다 (Case #${i+1})`, "fail");
            errLog.style.display = 'block';
            errLog.innerText = `입력: ${tc.in}\n기댓값: ${tc.out}\n내 출력: ${res.out}`;
            btn.disabled = false; return;
        }
    }

    showResult("맞았습니다!! 🎉", "success");
    btn.disabled = false;
}

function showResult(text, type) {
    const resBox = document.getElementById('resultBox');
    if (resBox) {
        resBox.innerText = text;
        resBox.className = `result-display ${type}`;
    }
}
