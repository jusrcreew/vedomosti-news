const path = require('node:path');
const express = require('express');
const { getCategories, findCategory, getNews, UpstreamError } = require('./vedomosti');
const { newsHeading, formatDate } = require('./format');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.locals.formatDate = formatDate;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/categories', async (req, res, next) => {
  try {
    const { data, source } = await getCategories();
    res.json({ source, categories: data.map(({ slug, title }) => ({ slug, title })) });
  } catch (err) {
    next(err);
  }
});

app.get('/:count/news/for/:category', async (req, res, next) => {
  const partial = req.query.partial === '1';
  const renderError = (status, title, message) =>
    res.status(status).render(partial ? 'partials/error' : 'error', { title, message });

  const { count: rawCount, category: slug } = req.params;
  if (!/^[1-9]\d{0,3}$/.test(rawCount)) {
    return renderError(400, 'Неверное количество', `«${rawCount}» — не целое положительное число (от 1 до 9999).`);
  }
  const count = Number(rawCount);

  try {
    const category = await findCategory(slug);
    if (!category) {
      const { data } = await getCategories();
      return renderError(
        404,
        'Неизвестная категория',
        `Категории «${slug}» нет. Доступны: ${data.map((c) => c.slug).join(', ')}.`,
      );
    }

    const all = await getNews(category, count);
    const items = all.slice(0, count);
    const view = {
      heading: newsHeading(items.length, category.title),
      requested: count,
      items,
      category,
      count,
    };
    res.render(partial ? 'partials/news-list' : 'news', view);
  } catch (err) {
    if (err instanceof UpstreamError || err.name === 'TimeoutError' || err.name === 'TypeError') {
      console.error(`[news] ${err.message}`);
      return renderError(502, 'Источник недоступен', 'Не удалось получить новости от rss2json. Попробуйте ещё раз через минуту.');
    }
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Страница не найдена',
    message: 'Используйте адрес вида /10/news/for/politics или вернитесь на главную.',
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Ошибка сервера', message: 'Что-то пошло не так.' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Ведомости.Новости: http://localhost:${PORT}`);
  });
}

module.exports = app;