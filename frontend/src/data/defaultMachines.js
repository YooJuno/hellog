// Keep these IDs stable: a user's hiddenMachines documents refer to them.
// Initial catalog mirrors backend GymMachineSeeder without per-user seeding.
const catalog = {
  CHEST: [
    ['체스트 프레스', '머신'],
    ['펙 덱 플라이', '머신'],
    ['인클라인 체스트 프레스', '머신'],
    ['벤치 프레스', '바벨'],
    ['인클라인 벤치 프레스', '바벨'],
    ['스미스 체스트 프레스', '머신'],
    ['스미스 인클라인 프레스', '머신'],
    ['인클라인 덤벨 프레스', '덤벨'],
    ['덤벨 플라이', '덤벨'],
    ['푸시업', '맨몸'],
    ['딥스', '맨몸'],
  ],
  BACK: [
    ['랫 풀다운', '케이블'],
    ['시티드 케이블 로우', '케이블'],
    ['어시스트 풀업', '머신'],
    ['바벨 로우', '바벨'],
    ['원암 덤벨 로우', '덤벨'],
    ['T바 로우', '머신'],
    ['풀업', '맨몸'],
    ['백 익스텐션', '맨몸'],
  ],
  LEGS: [
    ['레그 프레스', '머신'],
    ['레그 익스텐션', '머신'],
    ['레그 컬', '머신'],
    ['스쿼트', '바벨'],
    ['스미스 스쿼트', '머신'],
    ['런지', '덤벨'],
    ['힙 쓰러스트', '바벨'],
    ['불가리안 스플릿 스쿼트', '덤벨'],
    ['힙 어브덕션', '머신'],
    ['카프 레이즈', '머신'],
    ['루마니안 데드리프트', '바벨'],
  ],
  SHOULDERS: [
    ['머신 숄더 프레스', '머신'],
    ['덤벨 숄더 프레스', '덤벨'],
    ['사이드 레터럴 레이즈', '덤벨'],
    ['프론트 레이즈', '덤벨'],
    ['리어 델트 플라이', '머신'],
    ['페이스 풀', '케이블'],
    ['업라이트 로우', '바벨'],
  ],
  ARMS: [
    ['바이셉 컬', '바벨'],
    ['덤벨 컬', '덤벨'],
    ['해머 컬', '덤벨'],
    ['프리처 컬', '머신'],
    ['케이블 푸시다운', '케이블'],
    ['오버헤드 트라이셉 익스텐션', '덤벨'],
    ['스컬 크러셔', '바벨'],
  ],
  CORE: [
    ['크런치 머신', '머신'],
    ['케이블 크런치', '케이블'],
    ['행잉 레그 레이즈', '맨몸'],
    ['플랭크', '맨몸'],
    ['앱 롤아웃', '기타'],
    ['러시안 트위스트', '맨몸'],
  ],
}

export const DEFAULT_MACHINES = Object.freeze(
  Object.entries(catalog).flatMap(([category, items]) => items.map(([name, equipmentType], index) => Object.freeze({
    id: `default-${category.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
    category,
    name,
    equipmentType,
    manufacturer: null,
    defaultMachine: true,
    createdAt: null,
  }))),
)

export default DEFAULT_MACHINES
