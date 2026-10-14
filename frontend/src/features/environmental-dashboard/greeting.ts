/** Indonesian time-of-day greeting, e.g. "Selamat pagi, Arka". */
export function greeting(name: string, date = new Date()) {
  const hour = date.getHours();
  const period = hour >= 4 && hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam";
  return `Selamat ${period}, ${name}`;
}
