(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var search = document.getElementById('search');
  var sort = document.getElementById('sort');
  search.value = params.get('q') || '';
  if (['newest', 'raised', 'endingsoon'].includes(params.get('sort'))) sort.value = params.get('sort');
  function render() {
    var query = search.value.trim().toLocaleLowerCase();
    var rows = window.OFFLINE_CAMPAIGNS.filter(function (c) {
      return c.active !== false && (c.title + ' ' + c.organizer).toLocaleLowerCase().includes(query);
    });
    if (params.get('status') === 'almost') rows = rows.filter(function (c) { return c.goal > 0 && c.raised / c.goal >= 0.75; });
    if (params.get('filter') === 'nonprofit') rows = rows.filter(function (c) { return c.organizer === 'Lumani Impact'; });
    if (sort.value === 'newest') rows.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    if (sort.value === 'raised') rows.sort(function (a, b) { return b.raised - a.raised; });
    if (sort.value === 'endingsoon') rows = rows.filter(function (c) { return c.end_date; }).sort(function (a, b) { return new Date(a.end_date) - new Date(b.end_date); });
    var list = document.getElementById('list');
    list.replaceChildren();
    document.getElementById('resultCount').textContent = rows.length + (rows.length === 1 ? ' campaign' : ' campaigns');
    var empty = document.getElementById('empty');
    empty.hidden = rows.length !== 0;
    empty.textContent = sort.value === 'endingsoon' ? 'The supplied campaign data does not include end dates. Choose another sorting option.' : 'No campaigns match your search.';
    rows.forEach(function (c) {
      var article = document.createElement('article');
      var link = document.createElement('a');
      link.href = 'campaign-detail.html?slug=' + encodeURIComponent(c.slug);
      var image = document.createElement('img');
      image.src = c.image_url;
      image.alt = '';
      image.loading = 'lazy';
      image.width = 360;
      image.height = 220;
      var heading = document.createElement('h2');
      heading.textContent = c.title;
      link.append(image, heading);
      article.append(link);
      list.append(article);
    });
    var url = new URL(location.href);
    if (query) url.searchParams.set('q', search.value); else url.searchParams.delete('q');
    if (sort.value !== 'default') url.searchParams.set('sort', sort.value); else url.searchParams.delete('sort');
    history.replaceState(null, '', url);
  }
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  render();
})();
