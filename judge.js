// ═══════════════════════════════════════════════════════
//  judge.js  —  그뭐냐 언어 인터프리터 + 채점 엔진
//
//  [공부 포인트] 인터프리터의 3단계 구조
//    1) Tokenizer  : 소스코드 문자열 → 토큰 배열
//    2) Parser     : 토큰 배열 → 값 (재귀 하강 파서)
//    3) Interpreter: 명령어 토큰 → 메모리/IO 조작
// ═══════════════════════════════════════════════════════


// ── 1. 인터프리터 ─────────────────────────────────────────
//
//  [공부 포인트] 순수 함수 설계 — 호출마다 독립된 실행 환경을 새로 만듦.
//  전역 상태가 없으므로 여러 TC를 연속 실행해도 서로 영향 없음.
function runProgram(code, inputLines) {

    const memory  = {};       // 주소(정수) → 값(정수). 희소 배열처럼 사용.
    let inputIdx  = 0;        // inputLines 를 앞에서부터 소비하는 포인터
    let outputBuf = "";       // 출력 결과 누적 버퍼
    const MAX_STEPS = 100000; // 무한루프 방지

    // ── 주소 해결기 ──────────────────────────────────────
    //  [공부 포인트] 포인터(간접 참조) 구현.
    //  '그' 개수 = 기본 주소,  '거' 개수 - 1 = 역참조 횟수
    //  "그거"   → 주소 1 (직접)
    //  "그그거" → memory[2] (1단계 포인터)
    function resolveAddr(memStr) {
        const geuCnt = (memStr.match(/그/g) || []).length;
        const geoCnt = (memStr.match(/거/g) || []).length;
        let addr = geuCnt;
        for (let i = 0; i < geoCnt - 1; i++) addr = memory[addr] || 0;
        return addr;
    }

    // ── 토크나이저 ───────────────────────────────────────
    //  [공부 포인트] 정규식 기반 렉싱(Lexing).
    //  긴 패턴을 짧은 것보다 앞에 배치해야 올바르게 매칭됨.
    //  (진짜뭐지 를 뭐지 보다 먼저 써야 하는 이유)
    function tokenizeLine(text) {
        const noComment = text.split('#')[0];
        const regex = /(그+거+)|(그+)|(진짜뭐지|진짜뭐냐|뭐더라|뭐지|뭐냐|있잖아)|(아|어)|(\.\.\.|\.\.|\.|,,|,|;;|;|~)/g;
        const tokens = [];

        noComment.replace(regex, (match, mem, num, cmd, bracket, op, offset) => {
            if      (mem)     tokens.push({ type: 'mem',     val: mem,  addr: resolveAddr(mem) });
            else if (num)     tokens.push({ type: 'num',     val: num });
            else if (cmd)     tokens.push({ type: 'cmd',     val: cmd });
            else if (bracket) tokens.push({ type: 'bracket', val: bracket });
            else if (op)      tokens.push({ type: 'op',      val: op });
        });

        return tokens;
    }

    // ── 수식 파서 (재귀 하강 파서) ───────────────────────
    //  [공부 포인트] Recursive Descent Parser.
    //  연산자 우선순위를 함수 호출 깊이로 표현:
    //    parseExpr   : ~  ;  ;;   (비교, 가장 낮음)
    //    parseTerm   : ,  ,,      (덧뺄셈)
    //    parseFactor : .  ..  ... (곱나눗셈, 높음)
    //    parseAtom   : 괄호, 메모리, 숫자 (가장 높음)
    //
    //  낮은 우선순위 함수가 높은 우선순위 함수를 호출하는 구조 덕분에
    //  수학적 우선순위가 자동으로 지켜짐.
    function evaluate(tokens) {
        let pos = 0;
        const consume = () => tokens[pos++];
        const peek    = () => tokens[pos];

        function parseAtom() {
            const t = consume();
            if (!t) return 0;
            if (t.type === 'bracket' && t.val === '아') {
                const res = parseExpr();
                consume(); // '어' 소비
                return res;
            }
            if (t.type === 'mem') return memory[resolveAddr(t.val)] || 0;
            if (t.type === 'num') return t.val.length; // '그' 개수 = 숫자값
            return 0;
        }

        function parseFactor() {
            let node = parseAtom();
            while (peek()?.type === 'op' && ['.','..','...'].includes(peek().val)) {
                const op = consume().val, r = parseAtom();
                if (op === '.')   node = node * r;
                else if (op === '..') node = r ? Math.floor(node / r) : 0;
                else              node = r ? node % r : 0;
            }
            return node;
        }

        function parseTerm() {
            let node = parseFactor();
            while (peek()?.type === 'op' && [',',',,'].includes(peek().val)) {
                const op = consume().val, r = parseFactor();
                node = op === ',' ? node + r : node - r;
            }
            return node;
        }

        function parseExpr() {
            let node = parseTerm();
            while (peek()?.type === 'op' && ['~',';',';;'].includes(peek().val)) {
                const op = consume().val, r = parseTerm();
                if (op === '~')       node = node === r ? 1 : 0;
                else if (op === ';')  node = node > r   ? 1 : 0;
                else                  node = node >= r  ? 1 : 0;
            }
            return node;
        }

        return parseExpr();
    }

    // ── 실행 루프 ─────────────────────────────────────────
    //  [공부 포인트] Fetch-Decode-Execute 사이클 (CPU 동작 원리와 동일).
    //    Fetch  : pc(프로그램 카운터) 위치의 줄을 읽음
    //    Decode : 토크나이징 후 명령어(cmd) 토큰 찾기
    //    Execute: switch 문으로 명령어에 맞는 동작 수행
    const lines = code.split('\n');
    let pc = 0, steps = 0;

    try {
        while (pc >= 0 && pc < lines.length) {
            if (++steps > MAX_STEPS)
                return { output: outputBuf, error: `실행 제한 초과 (${MAX_STEPS}스텝)` };

            const tokens = tokenizeLine(lines[pc]);
            const cmdTok = tokens.find(t => t.type === 'cmd');
            if (!cmdTok) { pc++; continue; }

            let jumped = false;

            switch (cmdTok.val) {

                // 뭐더라: 할당  →  <주소> 뭐더라 <수식>
                case '뭐더라': {
                    const ci  = tokens.indexOf(cmdTok);
                    const adr = tokens.slice(0, ci).find(t => t.type === 'mem');
                    if (adr) memory[resolveAddr(adr.val)] = evaluate(tokens.slice(ci + 1));
                    break;
                }

                // 뭐지: 숫자 입력  →  <주소> 뭐지
                case '뭐지': {
                    const ci  = tokens.indexOf(cmdTok);
                    const adr = tokens.slice(0, ci).find(t => t.type === 'mem');
                    if (adr) {
                        const raw = inputLines[inputIdx++];
                        memory[resolveAddr(adr.val)] = raw !== undefined ? (parseInt(raw) || 0) : 0;
                    }
                    break;
                }

                // 뭐냐: 숫자 출력  →  뭐냐 <수식>
                case '뭐냐': {
                    const ci = tokens.indexOf(cmdTok);
                    outputBuf += String(evaluate(tokens.slice(ci + 1)));
                    break;
                }

                // 진짜뭐지: 문자 입력 (ASCII 코드로 저장)  →  <주소> 진짜뭐지
                case '진짜뭐지': {
                    const ci  = tokens.indexOf(cmdTok);
                    const adr = tokens.slice(0, ci).find(t => t.type === 'mem');
                    if (adr) {
                        const raw = inputLines[inputIdx++];
                        memory[resolveAddr(adr.val)] = raw?.length > 0 ? raw.charCodeAt(0) : 0;
                    }
                    break;
                }

                // 진짜뭐냐: 문자 출력  →  진짜뭐냐 <수식>
                case '진짜뭐냐': {
                    const ci = tokens.indexOf(cmdTok);
                    outputBuf += String.fromCharCode(evaluate(tokens.slice(ci + 1)));
                    break;
                }

                // 있잖아: 상대 점프  →  있잖아 <수식>
                //  [공부 포인트] 절대 주소가 아닌 상대 오프셋으로 점프.
                //  0 이면 제자리(무한루프), 양수면 아래로, 음수면 위로.
                case '있잖아': {
                    const ci = tokens.indexOf(cmdTok);
                    pc += evaluate(tokens.slice(ci + 1));
                    jumped = true;
                    break;
                }
            }

            if (!jumped) pc++;
        }
    } catch (err) {
        return { output: outputBuf, error: String(err) };
    }

    return { output: outputBuf.trim(), error: null };
}


// ── 2. 탭 전환 ───────────────────────────────────────────
//  [공부 포인트] 실제 페이지 이동 없이 CSS display 를 토글해서
//  SPA(Single Page Application) 처럼 동작하게 만드는 패턴.
function switchProblem(prob) {
    document.querySelectorAll('.prob-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(a => a.classList.remove('active'));
    document.getElementById(`page-${prob}`).classList.add('active');
    document.getElementById(`tab-${prob}`).classList.add('active');
}


// ── 3. 채점 함수 ─────────────────────────────────────────
//  [공부 포인트] async/await + setTimeout(0) 패턴.
//  JS는 싱글 스레드라 루프가 돌 때 UI가 멈춤.
//  await new Promise(r => setTimeout(r, 0)) 로 루프마다 브라우저에
//  렌더링 기회를 줘서 프로그레스 바가 실시간으로 업데이트됨.
async function submitCode(prob) {

    // [공부 포인트] 방어적 프로그래밍 — 문제가 등록됐는지 먼저 확인
    if (!window.PROBLEMS[prob]) {
        alert(`문제 "${prob}" 를 찾을 수 없습니다.`);
        return;
    }

    const problem  = window.PROBLEMS[prob];
    const tcList   = problem.testCases;
    const code     = document.getElementById(`editor-${prob}`).value.trim();
    const resBox   = document.getElementById(`resultBox-${prob}`);
    const errLog   = document.getElementById(`errorLog-${prob}`);
    const progWrap = document.getElementById(`progressWrap-${prob}`);
    const progFill = document.getElementById(`progressFill-${prob}`);
    const progText = document.getElementById(`progressText-${prob}`);
    const progNum  = document.getElementById(`progressNum-${prob}`);
    const btn      = document.getElementById(`sBtn-${prob}`);

    if (!code) { alert('코드를 입력해주세요!'); return; }

    // UI 초기화
    resBox.style.display   = 'none';
    errLog.style.display   = 'none';
    progWrap.style.display = 'block';
    btn.disabled           = true;
    btn.innerText          = '채점 중...';

    // 프로그레스 업데이트 헬퍼
    const setProgress = (i) => {
        const pct = tcList.length ? Math.floor(i / tcList.length * 100) : 100;
        progFill.style.width = pct + '%';
        progText.innerText   = pct + '%';
        progNum.innerText    = `${i} / ${tcList.length}`;
    };

    setProgress(0);

    for (let i = 0; i < tcList.length; i++) {
        // 브라우저에게 렌더링 기회를 줌 → 프로그레스 바 실시간 갱신
        await new Promise(r => setTimeout(r, 0));
        setProgress(i);

        const inputLines = tcList[i].in.split('\n').map(s => s.trim()).filter(Boolean);
        const result = runProgram(code, inputLines);

        if (result.error) {
            progWrap.style.display = 'none';
            resBox.style.display   = 'block';
            resBox.className       = 'result-display res-error';
            resBox.innerText       = '런타임 에러';
            errLog.style.display   = 'block';
            errLog.innerText       = `케이스 ${i + 1} 에러\n\n${result.error}`;
            btn.disabled = false; btn.innerText = '다시 제출'; return;
        }

        if (result.output !== tcList[i].out) {
            progWrap.style.display = 'none';
            resBox.style.display   = 'block';
            resBox.className       = 'result-display res-fail';
            resBox.innerText       = '틀렸습니다';
            errLog.style.display   = 'block';
            errLog.innerText =
                `케이스 ${i + 1} 실패\n` +
                `입력:    ${tcList[i].in.replace(/\n/g, ' ')}\n` +
                `기댓값:  ${tcList[i].out}\n` +
                `내 출력: ${result.output}`;
            btn.disabled = false; btn.innerText = '다시 제출'; return;
        }
    }

    // 전체 통과
    setProgress(tcList.length);
    await new Promise(r => setTimeout(r, 300));
    progWrap.style.display = 'none';
    resBox.style.display   = 'block';
    resBox.className       = 'result-display res-success';
    resBox.innerText       = '맞았습니다!!';
    btn.disabled = false; btn.innerText = '다시 제출';
}


// ── 4. 초기화 ─────────────────────────────────────────────
//  [공부 포인트] DOMContentLoaded 이벤트.
//  HTML 파싱이 완전히 끝난 후 실행되므로 getElementById 가 안전하게 동작.
//  judge.js 는 <body> 맨 아래에 로드되므로 problems/*.js 는 이미 실행됐고
//  window.PROBLEMS 에 모든 문제가 등록된 상태임.
document.addEventListener('DOMContentLoaded', () => {
    Object.values(window.PROBLEMS).forEach(prob => prob.generateTC());
});
