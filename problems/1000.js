// ════════════════════════════════════════════════
//  problems/1000.js  ─  A+B 문제 정의
//
//  새 문제 추가: 이 파일 복사 → 번호/내용 수정
//               index.html에 <script src="problems/새번호.js"> 추가
// ════════════════════════════════════════════════

const PROBLEM_1000 = {

    id:          1000,
    title:       "A+B",
    timeLimit:   2,    // 초
    memoryLimit: 256,  // MB

    description: "두 정수 A와 B를 입력받은 다음, A+B를 출력하는 프로그램을 작성하시오.",
    inputDesc:   "첫째 줄에 A와 B가 주어진다. (0 &lt; A, B &lt; 10)",
    outputDesc:  "첫째 줄에 A+B를 출력한다.",

    // 사용자에게 보여주는 예제 (공개)
    examples: [
        { input: "1 2", output: "3"  },
        { input: "3 7", output: "10" },
    ],

    // 실제 채점 테스트케이스 (숨김)
    testCases: [
        { in: "1 2",     out: "3"   },
        { in: "10 20",   out: "30"  },
        { in: "100 200", out: "300" },
        { in: "0 0",     out: "0"   },
        { in: "-5 5",    out: "0"   },
        { in: "7 3",     out: "10"  },
    ],

    // 에디터 기본 코드
    starterCode: [
        "import sys",
        "",
        "a, b = map(int, sys.stdin.readline().split())",
        "print(a + b)"
    ].join("\n"),
};
