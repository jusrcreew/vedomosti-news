function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** "1 последняя новость", "3 последние новости", "10 последних новостей" */
function newsHeading(n, categoryTitle) {
  const words = plural(n, 'последняя новость', 'последние новости', 'последних новостей');
  return `${n} ${words} в категории ${categoryTitle}`;
}


function formatDate(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

module.exports = { plural, newsHeading, formatDate };