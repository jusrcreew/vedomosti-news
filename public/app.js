(function () {
  const select = document.getElementById('category');
  const countInput = document.getElementById('count');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  let controller = null;
  let debounce = null;

  function setStatus(text, kind) {
    status.textContent = text || '';
    status.className = 'status' + (kind ? ' status-' + kind : '');
  }

  function readCount() {
    const n = Number(countInput.value);
    return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
  }

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { categories, source } = await res.json();

      select.innerHTML = '';
      const placeholder = new Option('— выберите рубрику —', '');
      placeholder.disabled = true;
      placeholder.selected = true;
      select.add(placeholder);
      categories.forEach((c) => select.add(new Option(c.title, c.slug)));
      select.disabled = false;

      if (source === 'fallback') {
        setStatus('Сайт «Ведомостей» не ответил — показан базовый список рубрик.', 'warn');
      }

      const fromHash = decodeURIComponent(location.hash.slice(1));
      if (fromHash && categories.some((c) => c.slug === fromHash)) {
        select.value = fromHash;
        loadNews();
      }
    } catch (err) {
      select.innerHTML = '<option value="">Список недоступен</option>';
      setStatus('Не удалось загрузить список рубрик. Обновите страницу.', 'error');
    }
  }

  async function loadNews() {
    const slug = select.value;
    const count = readCount();
    if (!slug) return;
    if (!count) {
      setStatus('Введите целое число от 1 до 9999.', 'error');
      return;
    }

    if (controller) controller.abort();
    controller = new AbortController();
    const url = '/' + count + '/news/for/' + encodeURIComponent(slug);
    history.replaceState(null, '', '#' + slug);

    setStatus('Загружаем новости…', 'loading');
    result.setAttribute('aria-busy', 'true');
    result.classList.add('is-loading');
    try {
      const res = await fetch(url + '?partial=1', { signal: controller.signal });
      result.innerHTML = await res.text();
      if (res.ok) {
        const link = document.createElement('a');
        link.href = url;
        link.className = 'permalink';
        link.textContent = 'Открыть как отдельную страницу: ' + url;
        result.appendChild(link);
      }
      setStatus('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      result.innerHTML = '';
      setStatus('Сервер недоступен. Проверьте соединение и попробуйте снова.', 'error');
    } finally {
      result.removeAttribute('aria-busy');
      result.classList.remove('is-loading');
    }
  }

  select.addEventListener('change', loadNews);
  countInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadNews, 400);
  });
  document.getElementById('picker').addEventListener('submit', (e) => {
    e.preventDefault();
    loadNews();
  });

  loadCategories();
})();