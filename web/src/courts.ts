const numbers = ['04', '05', '10', '11', '12'];
const order = [1, 0, 3, 2];

export function courtNumber(index: number): string {
  return numbers[index] ?? String(index + 1);
}

export function displayCourts<T extends { courtIndex: number }>(courts: T[]): T[] {
  const byIndex = new Map(courts.map((court) => [court.courtIndex, court]));
  const ordered = order.flatMap((index) => {
    const court = byIndex.get(index);
    return court ? [court] : [];
  });
  return [...ordered, ...courts.filter((court) => !order.includes(court.courtIndex))];
}
