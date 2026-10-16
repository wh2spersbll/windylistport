(function () {
'use strict';

var DEFAULT_SITE = 'https://windylist.pl';
var TYPES = [['classic', 'Classic'], ['platformer', 'Platformer'], ['challenge', 'Challenge']];

// ---------- storage (always guarded) ----------
function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
}
function SITE() { return (store('wl_site') || DEFAULT_SITE).replace(/\/+$/, ''); }

var S = {
  tab: 'list', type: store('wl_type') || 'classic', q: '',
  demons: null, info: null, players: null, clans: null, statsView: 'players', error: null, loading: false
};

// ---------- helpers ----------
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
function $(id) { return document.getElementById(id); }

// ---- network layer ---------------------------------------------------------
// Phones use the native HTTP stack (no browser CORS limits), the desktop app uses
// the main process, and a plain browser falls back to fetch().
function rawGet(url, headers) {
  var cap = window.Capacitor;
  var native = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.CapacitorHttp;
  if (native) {
    return cap.Plugins.CapacitorHttp.get({ url: url, headers: headers, responseType: 'text', connectTimeout: 20000, readTimeout: 20000 })
      .then(function (r) {
        var d = r.data;
        return { status: r.status, text: typeof d === 'string' ? d : JSON.stringify(d) };
      });
  }
  if (window.wlHttp) return window.wlHttp(url, headers);
  var h = {}; Object.keys(headers).forEach(function (k) { if (k.toLowerCase() !== 'cookie') h[k] = headers[k]; });
  return fetch(url, { headers: h }).then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); });
}

function getText(url) {
  var cookie = store('wl_cookie') || '';
  var headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return rawGet(url, headers).then(function (res) {
    var ch = window.WLChallenge && window.WLChallenge.solve(res.text);
    if (!ch) return res;
    // The host asked us to prove we are a browser: answer its cookie test and retry once.
    cookie = ch.name + '=' + ch.value;
    store('wl_cookie', cookie);
    headers.Cookie = cookie;
    return rawGet(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'i=1', headers);
  });
}

function api(path) {
  var url = SITE() + '/api' + path;
  return getText(url).catch(function (e) {
    var m = String((e && e.message) || e);
    throw new Error("Couldn't reach " + SITE().replace(/^https?:\/\//, '') + ' (' + m + '). Check your internet connection and the server address in Account.');
  }).then(function (o) {
    var j;
    try { j = JSON.parse(o.text); } catch (e) {
      throw new Error('The server answered with a web page instead of data (HTTP ' + o.status + '): ' +
        String(o.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140));
    }
    if (o.status >= 400) throw new Error((j && (j.message || j.error)) || ('HTTP ' + o.status));
    return j;
  });
}

// Same scoring formula as the website (used when the API doesn't send points yet).
var TOP1 = 350;
function baseScore(p) {
  if (p >= 56) return 1.039035131 * ((185.7 * Math.exp(-0.02715 * p)) + 14.84);
  if (p >= 36) return 1.0371139743 * ((212.61 * Math.pow(1.036, 1 - p)) + 25.071);
  if (p >= 21) return ((250 - 83.389) * Math.pow(1.0099685, 2 - p) - 31.152) * 1.0371139743;
  if (p >= 4) return ((326.1 * Math.exp(-0.0871 * p)) + 51.09) * 1.037117142;
  if (p >= 1) return (-18.2899079915 * p) + 368.2899079915;
  return 0;
}
function score(pos, req, prog) {
  if (pos < 1 || prog < req) return 0;
  req = Math.max(1, Math.min(100, req));
  var b = baseScore(pos) * (TOP1 / baseScore(1));
  return prog === 100 ? b : (b * Math.pow(5, (prog - req) / Math.max(1, 100 - req))) / 10;
}
function pts(d) {
  var a = d.points && d.points.at_requirement != null ? d.points.at_requirement : score(d.position, d.requirement, d.requirement);
  var b = d.points && d.points.at_100 != null ? d.points.at_100 : score(d.position, d.requirement, 100);
  return [Number(a).toFixed(2), Number(b).toFixed(2)];
}

// ---------- data ----------
function loadDemons() {
  var all = [], after = 0, guard = 0;
  function page() {
    return api('/v2/demons/?limit=100&after=' + after).then(function (rows) {
      all = all.concat(rows);
      if (rows.length >= 100 && guard++ < 40) { after = rows[rows.length - 1].id; return page(); }
      return all;
    });
  }
  return page();
}
function loadPlayers() {
  var all = [], after = 0, guard = 0;
  function page() {
    return api('/v1/players/ranking/?limit=100&after=' + after).then(function (rows) {
      all = all.concat(rows);
      if (rows.length >= 100 && guard++ < 30) { after += rows.length; return page(); }
      return all;
    });
  }
  return page();
}

function refresh(force) {
  S.loading = true; S.error = null; render();
  var jobs = [
    api('/v1/list_information/').catch(function () { return null; }),
    loadDemons()
  ];
  return Promise.all(jobs).then(function (res) {
    S.info = res[0];
    if (S.info && S.info.top1_points) TOP1 = Number(S.info.top1_points) || 350;
    S.demons = res[1].filter(function (d) { return d.position > 0; });
    store('wl_cache', JSON.stringify({ info: S.info, demons: S.demons }));
  }).catch(function (e) {
    S.error = e.message || String(e);
  }).then(function () { S.loading = false; render(); });
}

function loadClans() {
  return api('/v1/clans/');
}
function mediaUrl(p) { return p ? SITE() + '/' + String(p).replace(/^\/+/, '') : ''; }
function colorOf(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8b5cf6'; }
function clanTag(c) {
  return c && c.name ? '<span class="ctag" style="color:' + colorOf(c.tag_color) + ';background:' + colorOf(c.tag_color) + '22">[' + esc(c.name) + ']</span> ' : '';
}

// ---------- views ----------
function viewList() {
  var h = '<div class="seg" id="types">';
  TYPES.forEach(function (t) {
    h += '<button data-type="' + t[0] + '"' + (S.type === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>';
  });
  h += '</div>';

  if (!S.demons) {
    if (S.error) return h + errorBox();
    return h + '<div class="spin"></div>';
  }
  var q = S.q.trim().toLowerCase();
  var items = S.demons.filter(function (d) {
    return (d.list_type || 'classic') === S.type &&
      (!q || String(d.name).toLowerCase().indexOf(q) >= 0 ||
        (d.publisher && String(d.publisher.name).toLowerCase().indexOf(q) >= 0) ||
        (d.verifier && String(d.verifier.name).toLowerCase().indexOf(q) >= 0));
  }).sort(function (a, b) { return a.position - b.position; });

  var counts = { classic: 0, platformer: 0, challenge: 0 };
  S.demons.forEach(function (d) { var k = d.list_type || 'classic'; counts[k] = (counts[k] || 0) + 1; });
  var summary = 'Loaded ' + S.demons.length + ' levels from ' + SITE().replace(/^https?:\/\//, '') +
    ' (Classic ' + counts.classic + ', Platformer ' + counts.platformer + ', Challenge ' + counts.challenge + ')';

  if (S.error) h += '<div class="note"><b>Showing saved data</b>' + esc(S.error) + '</div>';
  if (!items.length && !q && S.demons.length) {
    // The chosen tab is empty but other tabs have levels: jump to one that does.
    var other = TYPES.filter(function (t) { return counts[t[0]] > 0; })[0];
    if (other && other[0] !== S.type) { S.type = other[0]; return viewList(); }
  }
  if (!items.length) return h + '<div class="note"><b>No levels</b>' + (S.demons.length ? 'Nothing here' + (q ? ' matches your search.' : ' yet.') : 'The server returned no listed levels.') +
    '<br><small>' + esc(summary) + '</small></div>';

  var main = S.info && S.info.list_size || 75, ext = S.info && S.info.extended_list_size || 150;
  var last = '';
  items.forEach(function (d) {
    var sec = d.legacy ? 'Legacy' : d.position <= main ? 'Main list' : d.position <= ext ? 'Extended list' : 'Legacy';
    if (sec !== last) { h += '<div class="sect">' + sec + '</div>'; last = sec; }
    var p = pts(d), th = safeUrl(d.thumbnail);
    h += '<button class="card" data-id="' + d.id + '"><div class="thumb">' +
      (th ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(th) + '" onerror="this.remove()">' : '') +
      '</div><div class="meta"><h3>#' + d.position + ' - ' + esc(d.name) + '</h3>' +
      '<p>published by <u>' + esc(d.publisher && d.publisher.name) + '</u>, verified by <u>' + esc(d.verifier && d.verifier.name) + '</u></p>' +
      '<p class="pts">' + p[0] + ' (' + d.requirement + '%) — ' + p[1] + ' (100%) points</p></div></button>';
  });
  return h + '<div class="note"><small>' + esc(summary) + '</small></div>';
}

function viewStats() {
  var h = '<div class="seg" id="statsseg"><button data-sv="players"' + (S.statsView === 'players' ? ' class="on"' : '') + '>Players</button>' +
    '<button data-sv="clans"' + (S.statsView === 'clans' ? ' class="on"' : '') + '>Clans</button></div>';
  var q = S.q.trim().toLowerCase();

  if (S.statsView === 'clans') {
    if (!S.clans) return h + (S.error ? errorBox() : '<div class="spin"></div>');
    var cl = S.clans.filter(function (c) { return !q || String(c.name).toLowerCase().indexOf(q) >= 0; });
    if (!cl.length) return h + '<div class="note"><b>No clans yet</b>' + (q ? 'Nothing matches your search.' : 'Clans will show up here once players create them.') + '</div>';
    h += '<div class="sect">Clan leaderboard</div>';
    cl.forEach(function (c) {
      var ban = mediaUrl(c.banner), ic = mediaUrl(c.icon);
      h += '<button class="clan" data-clan="' + c.id + '">' +
        '<div class="cbanner"' + (ban ? ' style="background-image:linear-gradient(90deg,rgba(12,14,24,.2),rgba(12,14,24,.2)),url(\'' + esc(ban) + '\')"' : '') + '>' +
        '<span class="cicon">' + (ic ? '<img alt="" src="' + esc(ic) + '" onerror="this.remove()">' : '🛡') + '</span></div>' +
        '<div class="cinfo"><span class="crank">#' + c.rank + '</span><strong style="color:' + colorOf(c.tag_color) + '">' + esc(c.name) + '</strong>' +
        '<small>' + esc(c.description || 'WindyList clan') + '</small></div>' +
        '<div class="cpts"><b>' + Number(c.points).toFixed(2) + '</b><small>' + c.members + ' member' + (c.members === 1 ? '' : 's') + '</small></div></button>';
    });
    return h;
  }

  if (!S.players) return h + (S.error ? errorBox() : '<div class="spin"></div>');
  h += '<div class="sect">Player ranking</div>';
  var rows = S.players.filter(function (p) {
    return !q || String(p.name).toLowerCase().indexOf(q) >= 0 || (p.clan && String(p.clan.name).toLowerCase().indexOf(q) >= 0);
  });
  rows.forEach(function (p) {
    var c = p.nationality && p.nationality.iso_country_code;
    h += '<button class="row" data-player="' + p.id + '"><span class="rank">' + (p.rank != null ? p.rank : '') + '</span>' +
      (c ? '<img class="flag" alt="" src="' + esc(SITE() + '/assets/flags/' + String(c).toLowerCase() + '.svg') + '" onerror="this.style.visibility=\'hidden\'">' : '') +
      '<span class="name">' + clanTag(p.clan) + esc(p.name) + '</span><span class="score">' + Number(p.score).toFixed(2) + '</span></button>';
  });
  return h + (rows.length ? '' : '<div class="note"><b>No players</b></div>');
}

function viewAccount() {
  var s = SITE();
  return '<div class="sect">Account</div>' +
    '<div class="note" style="text-align:left;margin:0 18px">Sign in, register and submit records on the website. Your account works the same in the app and the site.' +
    '<br><a class="btn" target="_blank" rel="noopener" href="' + esc(s) + '/login">Sign in</a> ' +
    '<a class="btn" target="_blank" rel="noopener" href="' + esc(s) + '/register">Register</a> ' +
    '<a class="btn" target="_blank" rel="noopener" href="' + esc(s) + '/submit">Submit a record</a></div>' +
    '<div class="sect">More</div>' +
    '<div class="note" style="text-align:left;margin:0 18px">' +
    '<a href="' + esc(s) + '/guidelines" target="_blank" rel="noopener">Guidelines</a> · ' +
    '<a href="' + esc(s) + '/roulette" target="_blank" rel="noopener">Roulette</a> · ' +
    '<a href="' + esc(s) + '/time-machine" target="_blank" rel="noopener">Time machine</a> · ' +
    '<a href="' + esc(s) + '" target="_blank" rel="noopener">Full website</a></div>' +
    '<div class="sect">Server</div><div style="margin:0 18px">' +
    '<input id="siteurl" class="field" value="' + esc(s) + '" autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<button id="savesite" class="btn">Save &amp; reload</button></div>';
}

function errorBox() {
  return '<div class="note"><b>Can\'t load data</b>' + esc(S.error || '') +
    '<br><button class="btn" id="retry">Try again</button></div>';
}

function render() {
  var v = $('view');
  v.innerHTML = S.tab === 'list' ? viewList() : S.tab === 'stats' ? viewStats() : viewAccount();
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === S.tab);
  });
  var sb = $('searchbar');
  sb.style.display = S.tab === 'account' ? 'none' : '';
}

// ---------- detail sheets ----------
function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('sheet').scrollTop = 0;
}
function closeSheet() { $('sheet').hidden = true; }

function showDemon(id) {
  openSheet('<div class="spin"></div>');
  api('/v2/demons/' + id + '/').then(function (d) {
    var p = pts(d), th = safeUrl(d.thumbnail), vid = safeUrl(d.video);
    var h = '<div class="big">' + (th ? '<img referrerpolicy="no-referrer" src="' + esc(th) + '" onerror="this.remove()">' : '') + '</div>' +
      '<h2>#' + d.position + ' - ' + esc(d.name) + '</h2>';
    if (d.tags && d.tags.length) {
      h += '<div class="chips">' + d.tags.map(function (t) {
        return '<span class="chip" style="color:' + esc(/^#[0-9a-f]{3,8}$/i.test(t.color) ? t.color : '#fff') + '">' + esc(t.name) + '</span>';
      }).join('') + '</div>';
    }
    if (vid) h += '<a class="btn" target="_blank" rel="noopener" href="' + esc(vid) + '">▶ Watch verification</a>';
    h += '<div class="kv">' +
      '<span>Level ID</span><span>' + esc(d.level_id || '—') + '</span>' +
      '<span>Publisher</span><span>' + esc(d.publisher && d.publisher.name) + '</span>' +
      '<span>Verifier</span><span>' + esc(d.verifier && d.verifier.name) + '</span>' +
      '<span>Creators</span><span>' + esc((d.creators || []).map(function (c) { return c.name; }).join(', ') || '—') + '</span>' +
      '<span>Requirement</span><span>' + d.requirement + '%</span>' +
      '<span>Points</span><span>' + p[0] + ' (' + d.requirement + '%) — ' + p[1] + ' (100%)</span></div>';
    var recs = d.records || [];
    h += '<h4>Records (' + recs.length + ')</h4>';
    recs.forEach(function (r) {
      var v = safeUrl(r.video);
      h += '<div class="rec"><span>' + esc(r.player && r.player.name) + (v ? ' · <a target="_blank" rel="noopener" href="' + esc(v) + '">video</a>' : '') + '</span><b>' + r.progress + '%</b></div>';
    });
    openSheet(h);
  }).catch(function (e) { openSheet('<div class="note"><b>Couldn\'t load level</b>' + esc(e.message) + '</div>'); });
}

function showPlayer(id) {
  openSheet('<div class="spin"></div>');
  api('/v1/players/' + id + '/').then(function (p) {
    var names = function (a) { return (a || []).map(function (x) { return esc(x && (x.name || (x.demon && x.demon.name)) || ''); }).filter(Boolean).join(', ') || '—'; };
    var recs = p.records || [];
    var h = '<h2>' + clanTag(p.clan) + esc(p.name) + '</h2><div class="kv">' +
      '<span>Rank</span><span>' + (p.rank != null ? '#' + p.rank : '—') + '</span>' +
      '<span>Score</span><span>' + Number(p.score).toFixed(2) + '</span>' +
      '<span>Nation</span><span>' + esc(p.nationality && p.nationality.nation || '—') + '</span>' +
      '<span>Clan</span><span>' + (p.clan ? '<a href="#" data-clanlink="' + p.clan.id + '" style="color:' + colorOf(p.clan.tag_color) + '">' + esc(p.clan.name) + '</a>' : '—') + '</span>' +
      '<span>Verified</span><span>' + names(p.verified) + '</span>' +
      '<span>Published</span><span>' + names(p.published) + '</span>' +
      '<span>Created</span><span>' + names(p.created) + '</span></div><h4>Records (' + recs.length + ')</h4>';
    recs.forEach(function (r) {
      h += '<div class="rec"><span>' + esc(r.demon && r.demon.name || '') + '</span><b>' + esc(r.progress) + '%</b></div>';
    });
    openSheet(h);
  }).catch(function (e) { openSheet('<div class="note"><b>Couldn\'t load player</b>' + esc(e.message) + '</div>'); });
}

function showClan(id) {
  openSheet('<div class="spin"></div>');
  api('/v1/clans/' + id + '/').then(function (c) {
    var ban = mediaUrl(c.banner), ic = mediaUrl(c.icon), col = colorOf(c.tag_color);
    var h = '<div class="big"' + (ban ? ' style="background:url(\'' + esc(ban) + '\') center/cover"' : '') + '></div>' +
      '<div class="chead">' + (ic ? '<img class="cavatar" alt="" src="' + esc(ic) + '" onerror="this.remove()">' : '<span class="cavatar">🛡</span>') +
      '<div><h2 style="color:' + col + '">' + esc(c.name) + '</h2><div class="muted">' + esc(c.description || 'WindyList clan') + '</div></div></div>' +
      '<div class="kv"><span>Rank</span><span>#' + c.rank + '</span><span>Combined points</span><span>' + Number(c.points).toFixed(2) + '</span>' +
      '<span>Members</span><span>' + c.members + '</span></div><h4>Members</h4>';
    (c.members_list || []).forEach(function (m) {
      h += '<div class="rec"><span>' + clanTag({ name: c.name, tag_color: c.tag_color }) + esc(m.name) +
        (m.role === 'leader' ? ' <span class="chip">Leader</span>' : '') + '</span><b>' + Number(m.points).toFixed(2) + '</b></div>';
    });
    openSheet(h);
  }).catch(function (e) { openSheet('<div class="note"><b>Couldn\'t load clan</b>' + esc(e.message) + '</div>'); });
}

// ---------- events ----------
document.addEventListener('click', function (e) {
  var t = e.target.closest('button,a'); if (!t) return;
  if (t.hasAttribute('data-type')) { S.type = t.getAttribute('data-type'); store('wl_type', S.type); render(); return; }
  if (t.hasAttribute('data-id')) { showDemon(t.getAttribute('data-id')); return; }
  if (t.hasAttribute('data-player')) { showPlayer(t.getAttribute('data-player')); return; }
  if (t.hasAttribute('data-clan')) { showClan(t.getAttribute('data-clan')); return; }
  if (t.hasAttribute('data-clanlink')) { e.preventDefault(); showClan(t.getAttribute('data-clanlink')); return; }
  if (t.hasAttribute('data-sv')) { S.statsView = t.getAttribute('data-sv'); S.error = null; if (S.statsView === 'clans' && !S.clans) loadClansView(); render(); return; }
  if (t.id === 'retry') { S.tab === 'stats' ? (S.statsView === 'clans' ? loadClansView() : loadStats()) : refresh(); return; }
  if (t.id === 'savesite') {
    var v = ($('siteurl').value || '').trim();
    if (/^https:\/\//i.test(v)) { store('wl_site', v); S.demons = S.players = S.clans = null; S.tab = 'list'; refresh(); }
    else alert('Address must start with https://');
    return;
  }
});
$('sheet-back').addEventListener('click', closeSheet);
document.querySelectorAll('#tabbar button').forEach(function (b) {
  b.addEventListener('click', function () {
    S.tab = b.getAttribute('data-tab'); S.q = ''; $('searchin').value = ''; collapseSearch();
    if (S.tab === 'stats' && !S.players) loadStats();
    render();
  });
});
function loadStats() {
  S.error = null; render();
  loadPlayers().then(function (p) { S.players = p; }).catch(function (e) { S.error = e.message; }).then(render);
}
function loadClansView() {
  S.error = null; render();
  loadClans().then(function (c) { S.clans = c; }).catch(function (e) { S.error = e.message; }).then(render);
}
function collapseSearch() {
  $('searchin').hidden = true; $('searchbtn').hidden = false;
}
$('searchbtn').addEventListener('click', function () {
  $('searchbtn').hidden = true; $('searchin').hidden = false; $('searchin').focus();
});
$('searchin').addEventListener('input', function () { S.q = this.value; render(); });
$('searchin').addEventListener('blur', function () { if (!this.value) collapseSearch(); });

// Android hardware back closes the sheet first.
window.addEventListener('popstate', closeSheet);

// ---------- start: show cached data instantly, then refresh ----------
try {
  var c = JSON.parse(store('wl_cache') || 'null');
  if (c && c.demons) { S.demons = c.demons; S.info = c.info; if (c.info && c.info.top1_points) TOP1 = Number(c.info.top1_points) || 350; }
} catch (e) {}
render();
refresh();
})();
