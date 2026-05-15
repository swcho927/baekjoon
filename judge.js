// ═══════════════════════════════════════════════════════
//  judge.js  —  그뭐냐 언어 인터프리터 + 채점 엔진
//
//  외부 서버나 Pyodide 없이 브라우저에서 직접 실행.
//  모든 채점은 runProgram() 한 함수로 처리됨.
// ═══════════════════════════════════════════════════════


// ── 1. 그뭐냐 언어 인터프리터 ────────────────────────────
//
//  runProgram(code, inputLines) 를 호출하면:
//    - code       : 그뭐냐 소스코드 (string)
//    - inputLines : 입력값 배열 (예: ["3", "5"])
//  반환값: { output: "8", error: null }
//          오류 시: { output: "", error: "에러 메시지" }

function runProgram(code, inputLines) {

    // 메모리: 주소(정수) → 값(정수) 매핑
    const memory = {};

    // 입력 포인터: inputLines 를 순서대로 소비
    let inputIdx = 0;

    // 실행 결과 출력 버퍼
    let outputBuf = "";

    // 최대 실행 스텝 (무한루프 방지)
    const MAX_STEPS = 100000;

    // ── 주소 해결기 ──
    // "그거"  → 그 1개, 거 1개 → addr = 1
    // "그그거" → 그 2개, 거 1개 → addr = memory[2] (포인터)
    // 일반 규칙: 거의 개수 - 1 만큼 역참조
    function resolveAddr(memStr) {
        const geuCount = (memStr.match(/그/g) || []).length;
        const geoCount = (memStr.match(/거/g) || []).length;
        let addr = geuCount;
        // 거가 2개 이상이면 포인터 역참조
        for (let i = 0; i < geoCount - 1; i++) {
            addr = memory[addr] || 0;
        }
        return addr;
    }

    // ── 토크나이저 ──
    // 한 줄 텍스트를 토큰 배열로 분해
    function tokenizeLine(text) {
        // 주석 제거 후 처리
        const noComment = text.split('#')[0];

        // 우선순위 순서로 패턴 매칭
        // 진짜뭐지/진짜뭐냐 를 뭐지/뭐냐 보다 먼저 매칭해야 함
        const regex = /(그+거+)|(그+)|(진짜뭐지|진짜뭐냐|뭐더라|뭐지|뭐냐|있잖아)|(아|어)|(\.\.\.|\.\.|\.|,,|,|;;|;|~)/g;
        const tokens = [];
        let lastIdx = 0;

        noComment.replace(regex, (match, mem, num, cmd, bracket, op, offset) => {
            if (offset > lastIdx) {
                // 매칭되지 않은 텍스트는 무시 (공백 등)
            }
            if      (mem)     tokens.push({ type: 'mem',     val: mem,     addr: resolveAddr(mem) });
            else if (num)     tokens.push({ type: 'num',     val: num });
            else if (cmd)     tokens.push({ type: 'cmd',     val: cmd });
            else if (bracket) tokens.push({ type: 'bracket', val: bracket });
            else if (op)      tokens.push({ type: 'op',      val: op });
            lastIdx = offset + match.length;
        });

        return tokens;
    }

    // ── 수식 파서 ──
    // 토큰 배열을 받아 정수 값을 반환
    // 연산자 우선순위:
    //   가장 낮음: ~ (같음), ; (크다), ;; (크거나같음)
    //   중간:     , (더하기), ,, (빼기)
    //   높음:     . (곱하기), .. (나누기), ... (나머지)
    //   가장 높음: 아...어 (괄호), 메모리값, 그 개수
    function evaluate(tokens) {
        let pos = 0;

        const consume = () => tokens[pos++];
        const peek    = () => tokens[pos];

        // 원자값: 괄호, 메모리, 숫자 리터럴
        function parseAtom() {
            const t = consume();
            if (!t) return 0;
            if (t.type === 'bracket' && t.val === '아') {
                // 괄호 열기: 닫는 '어' 까지 수식 평가
                const res = parseExpr();
                consume(); // '어' 소비
                return res;
            }
            if (t.type === 'mem') {
                // 메모리 주소의 현재 값 반환
                return memory[resolveAddr(t.val)] || 0;
            }
            if (t.type === 'num') {
                // 그 개수 = 숫자 리터럴
                return t.val.length;
            }
            return 0;
        }

        // 곱셈/나눗셈/나머지 우선순위
        function parseFactor() {
            let node = parseAtom();
            while (peek() && peek().type === 'op' && ['.', '..', '...'].includes(peek().val)) {
                const op = consume().val;
                const right = parseAtom();
                if      (op === '.')   node = node * right;
                else if (op === '..')  node = right !== 0 ? Math.floor(node / right) : 0;
                else if (op === '...') node = right !== 0 ? node % right : 0;
            }
            return node;
        }

        // 덧셈/뺄셈 우선순위
        function parseTerm() {
            let node = parseFactor();
            while (peek() && peek().type === 'op' && [',', ',,'].includes(peek().val)) {
                const op = consume().val;
                const right = parseFactor();
                if (op === ',')  node = node + right;
                else             node = node - right;
            }
            return node;
        }

        // 비교 연산자 (가장 낮은 우선순위)
        function parseExpr() {
            let node = parseTerm();
            while (peek() && peek().type === 'op' && ['~', ';', ';;'].includes(peek().val)) {
                const op = consume().val;
                const right = parseTerm();
                if      (op === '~')  node = node === right ? 1 : 0;
                else if (op === ';')  node = node > right   ? 1 : 0;
                else if (op === ';;') node = node >= right  ? 1 : 0;
            }
            return node;
        }

        return parseExpr();
    }

    // ── 실행 루프 ──
    const lines = code.split('\n');
    let pc = 0;      // 프로그램 카운터 (현재 줄 번호)
    let steps = 0;   // 실행한 명령어 수 (무한루프 감지용)

    try {
        while (pc >= 0 && pc < lines.length) {

            // 무한루프 방지
            if (++steps > MAX_STEPS) {
                return { output: outputBuf, error: `실행 제한 초과 (${MAX_STEPS}스텝)` };
            }

            // 주석 제거 & 앞뒤 공백 제거
            const line = lines[pc].split('#')[0].trim();
            const tokens = tokenizeLine(line);

            // 빈 줄이거나 주석만 있는 줄은 건너뜀
            if (tokens.length === 0) { pc++; continue; }

            // 명령어 토큰 찾기
            const cmdTok = tokens.find(t => t.type === 'cmd');

            if (!cmdTok) { pc++; continue; }

            let jumped = false; // 이번 줄에서 점프가 발생했는지

            switch (cmdTok.val) {

                // 뭐더라: 메모리 주소에 값 저장
                // 형식: <주소> 뭐더라 <수식>
                case '뭐더라': {
                    const cmdIdx = tokens.indexOf(cmdTok);
                    const addrToks  = tokens.slice(0, cmdIdx);   // 왼쪽 = 주소
                    const valueToks = tokens.slice(cmdIdx + 1);   // 오른쪽 = 값 수식

                    // 주소 토큰이 메모리 토큰이어야 함
                    const addrTok = addrToks.find(t => t.type === 'mem');
                    if (addrTok) {
                        const targetAddr = resolveAddr(addrTok.val);
                        memory[targetAddr] = evaluate(valueToks);
                    }
                    break;
                }

                // 뭐지: 숫자를 입력받아 메모리에 저장
                // 형식: <주소> 뭐지
                case '뭐지': {
                    const cmdIdx = tokens.indexOf(cmdTok);
                    const addrToks = tokens.slice(0, cmdIdx);
                    const addrTok  = addrToks.find(t => t.type === 'mem');
                    if (addrTok) {
                        const targetAddr = resolveAddr(addrTok.val);
                        // 준비된 입력값을 순서대로 소비
                        const raw = inputLines[inputIdx++];
                        memory[targetAddr] = raw !== undefined ? (parseInt(raw) || 0) : 0;
                    }
                    break;
                }

                // 뭐냐: 수식 값을 출력 (숫자)
                // 형식: 뭐냐 <수식>
                case '뭐냐': {
                    const cmdIdx   = tokens.indexOf(cmdTok);
                    const valueToks = tokens.slice(cmdIdx + 1);
                    outputBuf += String(evaluate(valueToks));
                    break;
                }

                // 진짜뭐지: 문자 1개를 입력받아 ASCII 코드로 메모리에 저장
                case '진짜뭐지': {
                    const cmdIdx = tokens.indexOf(cmdTok);
                    const addrToks = tokens.slice(0, cmdIdx);
                    const addrTok  = addrToks.find(t => t.type === 'mem');
                    if (addrTok) {
                        const targetAddr = resolveAddr(addrTok.val);
                        const raw = inputLines[inputIdx++];
                        memory[targetAddr] = (raw && raw.length > 0) ? raw.charCodeAt(0) : 0;
                    }
                    break;
                }

                // 진짜뭐냐: 메모리 값을 문자로 출력 (ASCII)
                case '진짜뭐냐': {
                    const cmdIdx    = tokens.indexOf(cmdTok);
                    const valueToks = tokens.slice(cmdIdx + 1);
                    outputBuf += String.fromCharCode(evaluate(valueToks));
                    break;
                }

                // 있잖아: 상대적 줄 이동 (점프)
                // 형식: 있잖아 <수식>
                // 수식이 0이면 다음 줄로, 양수면 앞으로, 음수면 뒤로
                case '있잖아': {
                    const cmdIdx    = tokens.indexOf(cmdTok);
                    const valueToks = tokens.slice(cmdIdx + 1);
                    const offset    = evaluate(valueToks);
                    pc += offset;
                    jumped = true;
                    break;
                }
            }

            if (!jumped) pc++;
        }

    } catch (err) {
        return { output: outputBuf, error: String(err) };
    }

    // 출력 결과의 앞뒤 공백 제거 후 반환
    return { output: outputBuf.trim(), error: null };
}


// ── 2. 탭 전환 ───────────────────────────────────────────
//
//  사이드바 클릭 시 해당 문제 페이지로 전환
function switchProblem(prob) {
    // 모든 페이지 비활성화
    document.querySelectorAll('.prob-page').forEach(p => p.classList.remove('active'));
    // 모든 사이드바 항목 비활성화
    document.querySelectorAll('.sidebar-item').forEach(a => a.classList.remove('active'));
    // 선택한 페이지와 탭 활성화
    document.getElementById(`page-${prob}`).classList.add('active');
    document.getElementById(`tab-${prob}`).classList.add('active');
}


// ── 3. 채점 함수 ─────────────────────────────────────────
//
//  submitCode('aplusb') 처럼 문제 키를 넘기면
//  해당 문제의 TC를 전부 돌려서 결과를 UI에 표시
async function submitCode(prob) {

    const problem  = window.PROBLEMS[prob];
    const tcList   = problem.testCases;

    // DOM 요소 가져오기
    const editor   = document.getElementById(`editor-${prob}`);
    const resBox   = document.getElementById(`resultBox-${prob}`);
    const errLog   = document.getElementById(`errorLog-${prob}`);
    const progWrap = document.getElementById(`progressWrap-${prob}`);
    const progFill = document.getElementById(`progressFill-${prob}`);
    const progText = document.getElementById(`progressText-${prob}`);
    const progNum  = document.getElementById(`progressNum-${prob}`);
    const btn      = document.getElementById(`sBtn-${prob}`);

    const code = editor.value.trim();

    // 빈 코드 제출 방지
    if (!code) {
        alert('코드를 입력해주세요!');
        return;
    }

    // ── UI 초기화 ──
    resBox.style.display   = 'none';
    errLog.style.display   = 'none';
    progWrap.style.display = 'block';
    btn.disabled           = true;
    btn.innerText          = '채점 중...';

    // 프로그레스 업데이트 헬퍼
    const setProgress = (current) => {
        const pct = tcList.length === 0 ? 100 : Math.floor(current / tcList.length * 100);
        progFill.style.width = pct + '%';
        progText.innerText   = pct + '%';
        progNum.innerText    = `${current} / ${tcList.length}`;
    };

    setProgress(0);

    // ── 채점 루프 ──
    // setTimeout(0) 으로 브라우저에게 렌더링 기회를 줌
    // → 프로그레스 바가 실시간으로 업데이트됨
    for (let i = 0; i < tcList.length; i++) {

        // 브라우저가 UI를 업데이트할 수 있도록 잠깐 양보
        await new Promise(r => setTimeout(r, 0));

        setProgress(i);

        const tc = tcList[i];

        // 입력을 줄 단위로 분리해서 인터프리터에 전달
        const inputLines = tc.in.split('\n').map(s => s.trim()).filter(s => s !== '');

        // 그뭐냐 인터프리터 실행
        const result = runProgram(code, inputLines);

        // ── 런타임 에러 ──
        if (result.error) {
            progWrap.style.display = 'none';
            resBox.style.display   = 'block';
            resBox.className       = 'result-display res-error';
            resBox.innerText       = '런타임 에러';
            errLog.style.display   = 'block';
            errLog.innerText       = `케이스 ${i + 1} 에러\n\n${result.error}`;
            btn.disabled = false;
            btn.innerText = '다시 제출';
            return;
        }

        // ── 오답 ──
        if (result.output !== tc.out) {
            progWrap.style.display = 'none';
            resBox.style.display   = 'block';
            resBox.className       = 'result-display res-fail';
            resBox.innerText       = '틀렸습니다';
            errLog.style.display   = 'block';
            errLog.innerText =
                `케이스 ${i + 1} 실패\n` +
                `입력:   ${tc.in.replace(/\n/g, ' ')}\n` +
                `기댓값: ${tc.out}\n` +
                `내 출력: ${result.output}`;
            btn.disabled = false;
            btn.innerText = '다시 제출';
            return;
        }
    }

    // ── 전체 통과 ──
    setProgress(tcList.length);
    await new Promise(r => setTimeout(r, 300)); // 100% 잠깐 보여주기
    progWrap.style.display = 'none';
    resBox.style.display   = 'block';
    resBox.className       = 'result-display res-success';
    resBox.innerText       = '맞았습니다!!';
    btn.disabled  = false;
    btn.innerText = '다시 제출';
}


// ── 4. 초기화 ─────────────────────────────────────────────
//
//  페이지 로드 완료 후 모든 문제의 TC 생성
document.addEventListener('DOMContentLoaded', () => {
    Object.values(window.PROBLEMS).forEach(prob => prob.generateTC());
});
