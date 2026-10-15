/** Человекочитаемые ошибки сети / API для магазина и кузни. */
export function friendlyUiError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return 'Нет связи с сервером — проверьте интернет и попробуйте снова';
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (!msg) return fallback;
    if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
      return 'Нет связи с сервером — проверьте интернет и попробуйте снова';
    }
    if (/timeout|timed out/i.test(msg)) {
      return 'Сервер не ответил вовремя — попробуйте ещё раз';
    }
    return msg;
  }
  return fallback;
}
