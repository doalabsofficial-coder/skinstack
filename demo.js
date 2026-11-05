// 시연 페이지: 단계 버튼을 누르면 휴대폰 화면(iframe, 데모 모드)이 해당 기능으로 이동
const DEMO_KEY = 'skinstack:demo:v1'; // store.js 의 데모 저장 키와 같아야 함

// 루틴 id 는 데모 데이터를 만들 때 정해지므로 이름으로 찾음 (같은 출처라 부모 페이지에서 읽을 수 있음)
const routineHash = (name) => {
  try {
    const r = JSON.parse(localStorage.getItem(DEMO_KEY))?.customRoutines?.find((x) => x.name === name);
    return r ? `#/routines/${r.id}` : '#/routines';
  } catch { return '#/routines'; }
};

const STEPS = [
  { title: '오늘의 루틴', desc: '거울 카드에 오늘 진행률이 보여요. 단계 번호를 눌러 "발랐어요" 체크를 해 보세요.', hash: () => '#/' },
  { title: '내 화장대', desc: '가진 제품이 선반 위에 놓여 있어요. 종류마다 병·튜브·크림통 모양이 달라요.', hash: () => '#/vault' },
  { title: '루틴 분석 · 조정이 필요한 경우', desc: 'AHA/BHA 토너와 레티놀 크림은 제조사가 함께 쓰지 말라고 안내한 조합이에요. 근거 문장과 추천 순서를 보여 줘요.', hash: () => routineHash('레티놀 데이 저녁'), focus: '.routine-side' },
  { title: '루틴 분석 · 잘 짠 루틴', desc: '제형 순서와 공식 사용법에 맞으면 "그대로 유지해도 괜찮아요"라고 알려 줘요. 사용 후기 기록도 볼 수 있어요.', hash: () => routineHash('평일 아침'), focus: '.routine-side' },
  { title: '제품 DB · 성분 근거', desc: '전성분은 공식 몰 원문 그대로, 분자량은 PubChem 자료예요. 레티놀 오일은 일반 순서와 달리 제조사 안내대로 크림 앞에 와요.', hash: () => '#/catalog/cosrx-retinol-05-oil' },
  { title: '마스크팩', desc: '여러 브랜드 마스크 중 오늘 쓸 것을 고르고, 타이머와 "사용 완료"로 재고를 관리해요.', hash: () => '#/masks' },
  { title: '구경하기', desc: '다른 사람들이 공개한 루틴을 피부 타입별로 보고, 내 루틴으로 복사할 수 있어요.', hash: () => '#/routines?tab=explore' },
  { title: '사진으로 등록', desc: '라벨 앞·뒤를 찍으면 전성분과 사용법을 글자로 읽어 와요. 사용 시간·빈도는 성분을 보고 앱이 정해요.', hash: () => '#/add?mode=photo' },
];

const frame = document.getElementById('app');
const list = document.getElementById('steps');
let current = 0;

function go(i) {
  current = i;
  frame.contentWindow.location.hash = STEPS[i].hash();
  // 핵심 부분(예: 분석 결과)이 화면 아래에 있으면 휴대폰 화면을 그 위치로 스크롤
  // (scrollIntoView 는 바깥 시연 페이지까지 움직이므로 휴대폰 화면 안에서만 스크롤)
  if (STEPS[i].focus) {
    setTimeout(() => {
      const w = frame.contentWindow;
      const el = frame.contentDocument?.querySelector(STEPS[i].focus);
      if (el) w.scrollTo({ top: el.getBoundingClientRect().top + w.scrollY - 70, behavior: 'smooth' });
    }, 700);
  }
  list.querySelectorAll('.step').forEach((b, n) => b.setAttribute('aria-current', String(n === i)));
}

STEPS.forEach((s, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'step';
  b.setAttribute('aria-current', String(i === 0));
  b.innerHTML = '<b class="num"></b><strong></strong><span></span>';
  b.querySelector('.num').textContent = i + 1;
  b.querySelector('strong').textContent = s.title;
  b.querySelector('span').textContent = s.desc;
  b.addEventListener('click', () => go(i));
  li.append(b);
  list.append(li);
});

document.getElementById('reset').addEventListener('click', () => {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* 저장소 사용 불가 */ }
  // '#' 뒤만 바뀌면 새로 불러오지 않으므로 매번 다른 주소로 열어 데모 데이터를 다시 채움
  frame.src = `./?demo=1&r=${Date.now()}#/`;
  current = 0;
  list.querySelectorAll('.step').forEach((b, n) => b.setAttribute('aria-current', String(n === 0)));
});
