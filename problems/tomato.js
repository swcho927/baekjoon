 // ═══════════════════════════════════════════════════════
//  problems/tomato.js  —  7576번 토마토
// ═══════════════════════════════════════════════════════

(function () {

    // ── Solver (정답 계산용 JS BFS) ───────────────────────
    function solve(m, n, grid) {
        const g = grid.map(r => [...r]);
        const q = []; let head = 0, totalZero = 0;
        for (let y = 0; y < n; y++)
            for (let x = 0; x < m; x++) {
                if (g[y][x] === 1) q.push(x, y, 0);
                if (g[y][x] === 0) totalZero++;
            }
        if (totalZero === 0) return 0;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        let result = 0, filled = 0;
        while (head < q.length) {
            const x = q[head++], y = q[head++], d = q[head++];
            for (const [dx, dy] of dirs) {
                const nx = x+dx, ny = y+dy;
                if (nx>=0&&nx<m&&ny>=0&&ny<n&&g[ny][nx]===0) {
                    g[ny][nx]=1; filled++; result=d+1; q.push(nx,ny,d+1);
                }
            }
        }
        return filled === totalZero ? result : -1;
    }

    // ── TC 빌더 ───────────────────────────────────────────
    const tc = [];

    function add(m, n, grid) {
        tc.push({ in: `${m} ${n}\n` + grid.map(r => r.join(' ')).join('\n'), out: String(solve(m, n, grid)) });
    }

    function randGrid(m, n, seed, ripe, empty) {
        const rand = seededRand(seed);
        return Array.from({length: n}, () =>
            Array.from({length: m}, () => {
                const r = rand();
                return r < ripe ? 1 : r < ripe + empty ? -1 : 0;
            })
        );
    }

    function generateTC() {
        tc.length = 0;

        // A. 공식 예제 (3)
        add(6,4,[[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,1]]);
        add(6,4,[[0,-1,0,0,0,0],[-1,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,1]]);
        add(6,4,[[1,-1,0,0,0,0],[0,-1,0,0,0,0],[0,0,0,0,-1,0],[0,0,0,0,-1,1]]);

        // B. 2×2 경계값 (8)
        add(2,2,[[1,1],[1,1]]); add(2,2,[[0,0],[0,0]]); add(2,2,[[-1,-1],[-1,-1]]);
        add(2,2,[[1,0],[0,0]]); add(2,2,[[1,-1],[-1,0]]); add(2,2,[[-1,0],[0,1]]);
        add(2,2,[[1,0],[0,-1]]); add(2,2,[[-1,1],[0,-1]]);

        // C. 직선/비율 극단 (6)
        {const g=Array.from({length:2},()=>Array(1000).fill(0));g[0][0]=1;add(1000,2,g);}
        {const g=Array.from({length:2},()=>Array(1000).fill(0));g[0][999]=1;add(1000,2,g);}
        {const g=Array.from({length:1000},()=>Array(2).fill(0));g[0][0]=1;add(2,1000,g);}
        {const g=Array.from({length:2},()=>Array(20).fill(0));g[0][0]=1;g[0][10]=-1;g[1][10]=-1;add(20,2,g);}
        {const g=Array.from({length:2},()=>Array(500).fill(0));g[0][249]=1;add(500,2,g);}
        {const g=Array.from({length:500},()=>Array(2).fill(0));g[249][0]=1;add(2,500,g);}

        // D. 멀티소스 BFS (6)
        {const g=Array.from({length:20},()=>Array(20).fill(0));g[0][0]=1;g[19][19]=1;add(20,20,g);}
        {const g=Array.from({length:20},()=>Array(20).fill(0));g[0][0]=1;g[0][19]=1;g[19][0]=1;g[19][19]=1;add(20,20,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(0));for(let i=0;i<10;i++){g[0][i]=1;g[9][i]=1;g[i][0]=1;g[i][9]=1;}add(10,10,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(0));for(let y=0;y<10;y++)for(let x=0;x<10;x++)if((x+y)%3===0)g[y][x]=1;add(10,10,g);}
        {const g=Array.from({length:15},()=>Array(15).fill(0));g[0][0]=1;g[7][7]=1;g[14][14]=1;g[3][3]=-1;g[3][4]=-1;g[4][3]=-1;add(15,15,g);}
        {const g=Array.from({length:21},()=>Array(21).fill(0));g[10][10]=1;add(21,21,g);}

        // E. 고립/장벽 (8)
        {const g=Array.from({length:10},()=>Array(10).fill(0));for(let y=0;y<10;y++)g[y][5]=-1;g[0][0]=1;add(10,10,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(0));for(let x=0;x<10;x++)g[5][x]=-1;g[0][0]=1;add(10,10,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(0));for(let i=2;i<=7;i++){g[2][i]=-1;g[7][i]=-1;g[i][2]=-1;g[i][7]=-1;}g[0][0]=1;add(10,10,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(-1));for(let x=0;x<10;x++){g[0][x]=0;g[9][x]=0;}for(let y=0;y<10;y++){g[y][0]=0;g[y][9]=0;}g[0][0]=1;add(10,10,g);}
        {const m=11,n=5;const g=Array.from({length:n},()=>Array(m).fill(-1));for(let x=0;x<m;x++)g[0][x]=0;g[0][0]=1;for(let y=0;y<n;y++)g[y][m-1]=0;for(let x=0;x<m;x++)g[n-1][x]=0;for(let y=0;y<n;y++)g[y][0]=0;add(m,n,g);}
        {const g=Array.from({length:5},()=>Array(5).fill(0));for(let y=0;y<5;y++)for(let x=0;x<5;x++)if((x+y)%2===0)g[y][x]=-1;g[1][0]=1;add(5,5,g);}
        {const g=Array.from({length:10},()=>Array(20).fill(-1));for(let y=0;y<10;y++)for(let x=0;x<9;x++)g[y][x]=0;for(let y=0;y<10;y++)for(let x=11;x<20;x++)g[y][x]=0;g[5][9]=0;g[0][0]=1;add(20,10,g);}
        {const g=Array.from({length:7},()=>Array(7).fill(0));for(let i=0;i<7;i++){g[0][i]=-1;g[6][i]=-1;g[i][0]=-1;g[i][6]=-1;}g[3][3]=1;add(7,7,g);}

        // F. 극단 단순 (5)
        add(100,100,Array.from({length:100},()=>Array(100).fill(1)));
        add(100,100,Array.from({length:100},()=>Array(100).fill(0)));
        add(100,100,Array.from({length:100},()=>Array(100).fill(-1)));
        {const g=Array.from({length:10},()=>Array(10).fill(-1));g[5][5]=0;add(10,10,g);}
        {const g=Array.from({length:10},()=>Array(10).fill(-1));g[5][5]=1;add(10,10,g);}

        // G. 시드 고정 랜덤 (15)
        [[10,10,1,0.1,0.1],[10,10,2,0.0,0.3],[20,20,3,0.05,0.2],[20,20,4,0.15,0.0],
         [30,30,5,0.1,0.1],[50,50,6,0.05,0.15],[50,50,7,0.2,0.05],[100,100,8,0.03,0.1],
         [100,100,9,0.1,0.1],[150,150,10,0.05,0.05],[200,200,11,0.02,0.2],
         [300,300,12,0.03,0.1],[400,400,13,0.01,0.05],[500,500,14,0.02,0.1],[700,700,15,0.01,0.05]
        ].forEach(([m,n,s,r,e]) => add(m, n, randGrid(m,n,s,r,e)));

        // H. 최대 크기 스트레스 (9)
        {const g=Array.from({length:1000},()=>Array(1000).fill(0));g[0][0]=1;add(1000,1000,g);}
        {const g=Array.from({length:1000},()=>Array(1000).fill(0));g[999][999]=1;add(1000,1000,g);}
        {const g=Array.from({length:1000},()=>Array(1000).fill(0));g[500][500]=1;add(1000,1000,g);}
        add(1000,1000,Array.from({length:1000},()=>Array(1000).fill(1)));
        add(1000,1000,Array.from({length:1000},()=>Array(1000).fill(0)));
        add(1000,1000,Array.from({length:1000},()=>Array(1000).fill(-1)));
        {const g=Array.from({length:1000},()=>Array(1000).fill(0));for(let y=0;y<1000;y++)g[y][500]=-1;g[0][0]=1;add(1000,1000,g);}
        {const g=Array.from({length:1000},()=>Array(1000).fill(0));g[0][0]=1;g[0][999]=1;g[999][0]=1;g[999][999]=1;add(1000,1000,g);}
        add(1000,1000,randGrid(1000,1000,9999,0.01,0.1));

        document.getElementById('tcCountTomato').innerText = `총 ${tc.length}개`;
    }

    // ── PROBLEMS 레지스트리에 등록 ────────────────────────
    window.PROBLEMS = window.PROBLEMS || {};
    window.PROBLEMS['tomato'] = {
        testCases:   tc,
        generateTC:  generateTC,
        editor:      null,
        editorCreated: false,
        defaultCode: "import sys\nfrom collections import deque\ninput = sys.stdin.readline\n\n# 코드를 작성해 보세요\n"
    };

})();
