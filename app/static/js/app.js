// ── State ─────────────────────────────────────────────────────────────────────
let pendingEmail = '';      // email waiting for OTP verification
let sessionApiKey = '';     // plain-text key held only for the current session
let selectedShortCode = null;
let freshCode = null;       // code created this session, animated into the rail
let userUrls = [];

const TILE_COLORS = ['#7A1F45', '#1F3E7A', '#1C5E4C', '#6A4A16', '#3E2A6E', '#6B2A1A', '#14566B', '#4D5A1A', '#5E1F66', '#2B4A63'];

// ── Utilities ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
}

function showError(areaId, msgId, message) {
    $(msgId).textContent = message;
    $(areaId).classList.remove('hidden');
}

function hideError(areaId) {
    $(areaId).classList.add('hidden');
}

// FastAPI returns `detail` as a string or as a list of validation errors.
function errorText(data, fallback) {
    if (!data || !data.detail) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
        return data.detail.map(d => {
            const field = (d.loc || []).slice(-1)[0];
            if (field === 'custom_alias') return 'Alias must be 4 to 20 characters.';
            if (field === 'long_url') return 'That doesn\'t look like a valid URL. Include https://';
            if (field === 'expires_in_days') return 'Expiry must be a whole number of days, 1 or more.';
            return d.msg;
        }).join(' ');
    }
    return fallback;
}

async function readJson(res) {
    try { return await res.json(); } catch { return null; }
}

let toastTimer;
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

function copyText(text, onDone) {
    navigator.clipboard.writeText(text).then(onDone, () => toast('Copy failed. Select the text and copy it manually.'));
}

function tileColor(code) {
    let h = 0;
    for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TILE_COLORS[h % TILE_COLORS.length];
}

function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
    return new Date(iso).toLocaleDateString('en-GB', opts);
}

function prettyUrl(u) {
    return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function hostOf(ref) {
    try { return new URL(ref).hostname.replace(/^www\./, ''); } catch { return ref; }
}

function isExpired(url) {
    return !url.is_active || (url.expires_at && new Date(url.expires_at) < new Date());
}

function authHeaders(extra = {}) {
    return { 'Accept': 'application/json', 'X-API-Key': sessionApiKey, ...extra };
}

// ── Auth: tabs ────────────────────────────────────────────────────────────────
window.switchTab = (tab) => {
    $('loginForm').classList.toggle('hidden', tab !== 'login');
    $('registerForm').classList.toggle('hidden', tab !== 'register');
    $('otpForm').classList.add('hidden');
    $('apiKeyReveal').classList.add('hidden');
    $('keyPromptForm').classList.add('hidden');
    hideError('authError');
    $('authTabs').classList.remove('hidden');
    $('tabLogin').setAttribute('aria-selected', tab === 'login');
    $('tabRegister').setAttribute('aria-selected', tab === 'register');
    $('authSubtitle').textContent = tab === 'login'
        ? 'Welcome back. Log in to see your links.'
        : 'Free account. We\'ll email you a code to confirm it.';
};

// ── Auth: login ───────────────────────────────────────────────────────────────
$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('loginBtn');
    setLoading(btn, true);
    try {
        const email = $('loginEmail').value;
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: $('loginPassword').value }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorText(data, 'Login failed. Check your email and password.'));

        sessionStorage.setItem('jwt', data.access_token);
        sessionStorage.setItem('email', email);

        const savedKey = sessionStorage.getItem('apiKey');
        if (savedKey) showDashboard(email, savedKey);
        else promptForApiKey();
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Auth: register ────────────────────────────────────────────────────────────
$('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('registerBtn');
    setLoading(btn, true);
    try {
        const email = $('regEmail').value;
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: $('regPassword').value }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorText(data, 'Couldn\'t create the account. Try again.'));

        pendingEmail = email;
        $('registerForm').classList.add('hidden');
        $('authTabs').classList.add('hidden');
        $('otpEmail').textContent = email;
        $('otpForm').classList.remove('hidden');
        $('authSubtitle').textContent = 'One more step: confirm your email.';
        $('otpCode').focus();
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Auth: verify code ─────────────────────────────────────────────────────────
$('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('otpBtn');
    setLoading(btn, true);
    try {
        const res = await fetch('/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail, otp: $('otpCode').value }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorText(data, 'That code didn\'t work. Check it and try again.'));

        sessionApiKey = data.api_key;
        sessionStorage.setItem('apiKey', data.api_key);
        sessionStorage.setItem('email', data.email);
        showKeyReveal(data.api_key, 'Account activated',
            'This is your API key. Copy it somewhere safe: it is shown only once.');
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

function showKeyReveal(key, title, note) {
    ['otpForm', 'keyPromptForm', 'loginForm', 'registerForm', 'authTabs'].forEach(id => $(id).classList.add('hidden'));
    $('revealTitle').textContent = title;
    $('revealNote').textContent = note;
    $('revealedApiKey').textContent = key;
    $('apiKeyReveal').classList.remove('hidden');
    $('authSubtitle').textContent = 'Save your key before you continue.';
}

$('copyApiKeyBtn').addEventListener('click', () => {
    copyText($('revealedApiKey').textContent, () => toast('API key copied'));
});

window.proceedToDashboard = () => {
    showDashboard(sessionStorage.getItem('email'), sessionApiKey);
};

// ── Auth: API key prompt (key not in this browser) ───────────────────────────
function promptForApiKey() {
    $('loginForm').classList.add('hidden');
    $('authTabs').classList.add('hidden');
    $('keyPromptForm').classList.remove('hidden');
    $('authSubtitle').textContent = 'Logged in. One more thing:';
    $('inputApiKey').value = '';
    $('inputApiKey').focus();
}

$('keyPromptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('keyPromptBtn');
    setLoading(btn, true);
    const key = $('inputApiKey').value.trim();
    try {
        const res = await fetch('/urls', { headers: { 'Accept': 'application/json', 'X-API-Key': key } });
        if (!res.ok) throw new Error('That API key wasn\'t accepted. Check it, or generate a new one below.');
        sessionStorage.setItem('apiKey', key);
        showDashboard(sessionStorage.getItem('email'), key);
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

window.handleRegenerateKey = async () => {
    hideError('authError');
    const btn = $('btnRegenerateKey');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
        const res = await fetch('/auth/regenerate-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('jwt')}` },
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorText(data, 'Couldn\'t generate a new key. Log in again and retry.'));
        sessionApiKey = data.api_key;
        sessionStorage.setItem('apiKey', data.api_key);
        showKeyReveal(data.api_key, 'New API key',
            'Your old key no longer works. Copy this one somewhere safe: it is shown only once.');
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
function showDashboard(email, apiKey) {
    sessionApiKey = apiKey;
    $('authPanel').classList.add('hidden');
    $('dashboardPanel').classList.remove('hidden');
    $('userEmail').textContent = email || '';
    $('urlsList').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    fetchUserUrls();
}

window.fetchUserUrls = async () => {
    try {
        const res = await fetch('/urls', { cache: 'no-cache', headers: authHeaders() });
        if (!res.ok) {
            if (res.status === 401) { sessionStorage.removeItem('apiKey'); logout(); return; }
            throw new Error('Couldn\'t load your links. Refresh to try again.');
        }
        userUrls = await res.json();
        userUrls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        renderRails();

        const current = userUrls.find(u => u.short_code === selectedShortCode);
        const firstLive = userUrls.find(u => !isExpired(u)) || userUrls[0];
        if (current) selectUrl(current, false);
        else if (firstLive) selectUrl(firstLive, false);
        else $('show').classList.add('empty');
    } catch (err) {
        showError('errorArea', 'errorMessage', err.message);
    }
};

function renderRails() {
    const live = userUrls.filter(u => !isExpired(u));
    const expired = userUrls.filter(isExpired);

    $('show').classList.toggle('empty', userUrls.length === 0);
    $('analyticsPlaceholder').classList.toggle('hidden', userUrls.length !== 0);

    $('activeCount').textContent = live.length ? `${live.length} active` : '';
    $('urlsListEmpty').classList.toggle('hidden', live.length !== 0);
    fillRail($('urlsList'), live);

    $('expiredWrap').classList.toggle('hidden', expired.length === 0);
    $('expiredCount').textContent = `${expired.length} link${expired.length === 1 ? '' : 's'}`;
    fillRail($('expiredList'), expired);
    freshCode = null;
}

function fillRail(rail, urls) {
    rail.innerHTML = '';
    urls.forEach(url => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile';
        b.setAttribute('role', 'listitem');
        b.dataset.code = url.short_code;
        b.style.setProperty('--tile', isExpired(url) ? '#3A3D45' : tileColor(url.short_code));
        b.setAttribute('aria-pressed', url.short_code === selectedShortCode);
        if (url.short_code === freshCode) b.classList.add('fresh');

        const top = document.createElement('span');
        top.className = 't-top num';
        const right = isExpired(url)
            ? (url.expires_at ? `Ended ${fmtDate(url.expires_at, { day: 'numeric', month: 'short' })}` : 'Inactive')
            : fmtDate(url.created_at, { day: 'numeric', month: 'short' });
        top.innerHTML = `<span>${url.clicks_count} click${url.clicks_count === 1 ? '' : 's'}</span><span></span>`;
        top.lastChild.textContent = right;

        const code = document.createElement('span');
        code.className = 't-code';
        code.textContent = '/' + url.short_code;

        const dest = document.createElement('span');
        dest.className = 't-dest';
        dest.textContent = prettyUrl(url.long_url);
        b.title = url.long_url;

        b.append(top, code, dest);
        b.addEventListener('click', () => selectUrl(url, true));
        rail.appendChild(b);
    });
}

async function selectUrl(url, animate) {
    selectedShortCode = url.short_code;
    document.querySelectorAll('.rail .tile').forEach(t => t.setAttribute('aria-pressed', t.dataset.code === url.short_code));

    const show = $('show');
    show.classList.remove('empty');
    $('analyticsPlaceholder').classList.add('hidden');
    show.style.setProperty('--tile', isExpired(url) ? '#3A3D45' : tileColor(url.short_code));
    if (animate) { show.classList.remove('swap'); void show.offsetWidth; show.classList.add('swap'); }

    $('activeShortCode').textContent = '/' + url.short_code;
    const dest = $('activeLongUrl');
    dest.textContent = prettyUrl(url.long_url);
    dest.href = url.long_url;
    dest.title = url.long_url;
    $('openShort').href = url.short_url;
    $('copyBtn').dataset.url = url.short_url;

    const status = $('activeStatus');
    const expired = isExpired(url);
    status.textContent = expired ? 'Expired' : 'Live';
    status.classList.toggle('off', expired);
    $('activeUrlCreated').textContent = `Created ${fmtDate(url.created_at)}`;
    $('activeUrlExpires').textContent = url.expires_at
        ? `${expired ? 'Expired' : 'Expires'} ${fmtDate(url.expires_at)}`
        : 'Never expires';

    await fetchStats(url.short_code);
}

async function fetchStats(code) {
    try {
        const res = await fetch(`/stats/${encodeURIComponent(code)}`, { cache: 'no-cache', headers: authHeaders() });
        if (!res.ok) throw new Error('Couldn\'t load stats for this link.');
        const data = await res.json();
        if (code !== selectedShortCode) return; // user moved on

        $('statTotalClicks').textContent = data.total_clicks;
        $('statUniqueIps').textContent = data.unique_ips;
        const topRef = data.top_referrers && data.top_referrers[0];
        const topCountry = data.top_countries && data.top_countries[0];
        $('statTopRef').textContent = topRef ? hostOf(topRef.referrer) : 'None yet';
        $('statTopCountry').textContent = topCountry ? topCountry.country : 'None yet';
        $('statTopRef').title = $('statTopRef').textContent;

        renderBars(data.clicks_by_day || {});
        renderList($('breakdownReferrers'), data.top_referrers, 'referrer', 'No referrers yet');
        renderList($('breakdownCountries'), data.top_countries, 'country', 'No countries yet');
    } catch (err) {
        showError('errorArea', 'errorMessage', err.message);
    }
}

function dayKey(d) {
    return d.toISOString().slice(0, 10);
}

function renderBars(byDay) {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        days.push({ d, n: byDay[dayKey(d)] || 0 });
    }
    const max = Math.max(1, ...days.map(x => x.n));
    const peakN = Math.max(...days.map(x => x.n));
    const peakIdx = peakN > 0 ? days.map(x => x.n).lastIndexOf(peakN) : -1;

    const bars = $('bars');
    bars.innerHTML = '';
    days.forEach((x, i) => {
        const bar = document.createElement('i');
        bar.style.height = (x.n / max * 100) + '%';
        bar.title = `${fmtDate(x.d, { day: 'numeric', month: 'short' })}: ${x.n} click${x.n === 1 ? '' : 's'}`;
        if (i === peakIdx) bar.className = 'peak';
        bars.appendChild(bar);
    });

    const short = { day: 'numeric', month: 'short' };
    $('axisStart').textContent = fmtDate(days[0].d, short);
    $('axisEnd').textContent = 'Today';
    $('chartPeak').textContent = peakIdx >= 0 ? `Peak ${peakN} on ${fmtDate(days[peakIdx].d, short)}` : 'No clicks yet';
}

function renderList(ol, rows, key, emptyText) {
    ol.innerHTML = '';
    if (!rows || rows.length === 0) {
        const li = document.createElement('li');
        li.className = 'none';
        li.textContent = emptyText;
        ol.appendChild(li);
        return;
    }
    rows.forEach(r => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = key === 'referrer' ? hostOf(r[key]) : r[key];
        name.title = r[key];
        const n = document.createElement('b');
        n.textContent = r.count;
        li.append(name, n);
        ol.appendChild(li);
    });
}

// ── Copy short link ───────────────────────────────────────────────────────────
$('copyBtn').addEventListener('click', () => {
    const btn = $('copyBtn');
    copyText(btn.dataset.url, () => {
        btn.classList.add('done');
        $('copyLabel').textContent = 'Copied';
        setTimeout(() => { btn.classList.remove('done'); $('copyLabel').textContent = 'Copy short link'; }, 1800);
    });
});

// ── Shorten ───────────────────────────────────────────────────────────────────
$('shortenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('errorArea');
    const btn = $('submitBtn');
    setLoading(btn, true);

    const payload = { long_url: $('longUrl').value.trim() };
    const alias = $('customAlias').value.trim();
    const expires = $('expiresIn').value;
    if (alias) payload.custom_alias = alias;
    if (expires) payload.expires_in_days = parseInt(expires, 10);

    try {
        const res = await fetch('/shorten', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(errorText(data, 'Couldn\'t shorten that URL. Try again.'));

        $('longUrl').value = '';
        $('customAlias').value = '';
        $('expiresIn').value = '';
        selectedShortCode = data.short_code;
        freshCode = data.short_code;
        await fetchUserUrls();
        copyText(data.short_url, () => toast(`/${data.short_code} created and copied`));
    } catch (err) {
        showError('errorArea', 'errorMessage', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Logout ────────────────────────────────────────────────────────────────────
window.logout = () => {
    sessionStorage.clear();
    sessionApiKey = '';
    selectedShortCode = null;
    userUrls = [];
    $('dashboardPanel').classList.add('hidden');
    $('authPanel').classList.remove('hidden');
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    hideError('errorArea');
    switchTab('login');
};

// ── Restore session on load ───────────────────────────────────────────────────
(function init() {
    const email = sessionStorage.getItem('email');
    const apiKey = sessionStorage.getItem('apiKey');
    if (email && apiKey) showDashboard(email, apiKey);
})();
