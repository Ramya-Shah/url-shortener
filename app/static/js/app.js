// ── State ─────────────────────────────────────────────────────────────────────
let pendingEmail = '';      // email waiting for OTP verification
let sessionApiKey = '';     // plain-text key held only for the current session
let clicksChartInstance = null;
let selectedShortCode = null;
let userUrls = [];          // local cache of user's shortened links

// ── Utilities ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
}

function showError(areaId, msgId, message) {
    $(areaId).classList.remove('hidden');
    $(msgId).textContent = message;
}

function hideError(areaId) {
    $(areaId).classList.add('hidden');
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--success)"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
    });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
window.switchTab = (tab) => {
    $('loginForm').classList.toggle('hidden', tab !== 'login');
    $('registerForm').classList.toggle('hidden', tab !== 'register');
    $('otpForm').classList.add('hidden');
    $('apiKeyReveal').classList.add('hidden');
    $('keyPromptForm').classList.add('hidden');
    hideError('authError');
    $('authTabs').classList.remove('hidden');
    $('tabLogin').classList.toggle('active', tab === 'login');
    $('tabRegister').classList.toggle('active', tab === 'register');
    $('authSubtitle').textContent = tab === 'login'
        ? 'Sign in or create an account to continue.'
        : 'Create your free account.';
};

// ── Auth Panel: Login ─────────────────────────────────────────────────────────
$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('loginBtn');
    setLoading(btn, true);
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: $('loginEmail').value,
                password: $('loginPassword').value,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed.');

        // Store JWT in sessionStorage (cleared when tab closes)
        sessionStorage.setItem('jwt', data.access_token);
        sessionStorage.setItem('email', $('loginEmail').value);

        // Check if API key is cached locally, otherwise prompt
        const savedKey = sessionStorage.getItem('apiKey');
        if (savedKey) {
            showDashboard($('loginEmail').value, savedKey);
        } else {
            promptForApiKey($('loginEmail').value);
        }
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Auth Panel: Register ──────────────────────────────────────────────────────
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Registration failed.');

        // Switch to OTP form
        pendingEmail = email;
        $('registerForm').classList.add('hidden');
        $('loginForm').classList.add('hidden');
        $('authTabs').classList.add('hidden');
        $('otpEmail').textContent = email;
        $('otpForm').classList.remove('hidden');
        $('authSubtitle').textContent = 'Check your email for the verification code.';
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Auth Panel: OTP Verify ────────────────────────────────────────────────────
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'OTP verification failed.');

        // Store the plain-text API key for this session
        sessionApiKey = data.api_key;
        sessionStorage.setItem('apiKey', data.api_key);
        sessionStorage.setItem('email', data.email);

        // Show the API key reveal
        $('otpForm').classList.add('hidden');
        $('revealedApiKey').textContent = data.api_key;
        $('apiKeyReveal').classList.remove('hidden');
        $('authSubtitle').textContent = 'Save your API key now!';
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Copy API Key button ───────────────────────────────────────────────────────
$('copyApiKeyBtn').addEventListener('click', () => {
    copyToClipboard($('revealedApiKey').textContent, $('copyApiKeyBtn'));
});

// ── Proceed to dashboard after registration ───────────────────────────────────
window.proceedToDashboard = () => {
    showDashboard(sessionStorage.getItem('email'), sessionApiKey);
};

// ── If logged-in returning user has no API key in session, show DOM key prompt
function promptForApiKey(email) {
    $('loginForm').classList.add('hidden');
    $('authTabs').classList.add('hidden');
    $('keyPromptForm').classList.remove('hidden');
    $('authSubtitle').textContent = 'API Key required to access dashboard.';
    $('inputApiKey').value = '';
}

$('keyPromptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('authError');
    const btn = $('keyPromptBtn');
    setLoading(btn, true);
    
    const key = $('inputApiKey').value.trim();
    const email = sessionStorage.getItem('email');
    
    try {
        // Verify key by calling /urls
        const res = await fetch('/urls', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-API-Key': key
            }
        });
        if (!res.ok) {
            throw new Error("Invalid API key. Please check the key you entered.");
        }
        
        // Key is valid! Save and go to dashboard
        sessionStorage.setItem('apiKey', key);
        showDashboard(email, key);
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        setLoading(btn, false);
    }
});

window.handleRegenerateKey = async () => {
    hideError('authError');
    const btn = $('btnRegenerateKey');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Regenerating...';
    
    const jwt = sessionStorage.getItem('jwt');
    const email = sessionStorage.getItem('email');
    
    try {
        const res = await fetch('/auth/regenerate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Regeneration failed.');
        
        // Save the new key for the session
        sessionApiKey = data.api_key;
        sessionStorage.setItem('apiKey', data.api_key);
        
        // Reset forms
        $('keyPromptForm').classList.add('hidden');
        
        // Update reveal area headers for regeneration flow
        $('apiKeyReveal').querySelector('h3').textContent = '🎉 New API Key Generated!';
        $('apiKeyReveal').querySelector('.api-key-warn').textContent = 'Save your new API key — your old key is now invalidated.';
        $('revealedApiKey').textContent = data.api_key;
        $('apiKeyReveal').classList.remove('hidden');
        $('authSubtitle').textContent = 'Save your new API key now!';
    } catch (err) {
        showError('authError', 'authErrorMsg', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

// ── Show the dashboard panel ──────────────────────────────────────────────────
function showDashboard(email, apiKey) {
    sessionApiKey = apiKey;
    $('authPanel').classList.add('hidden');
    $('dashboardPanel').classList.remove('hidden');
    $('mainContainer').classList.add('dashboard-active');
    $('userEmail').textContent = email;
    
    // Initial fetch of URLs
    fetchUserUrls();
}

// ── Fetch URLs created by user ────────────────────────────────────────────────
window.fetchUserUrls = async () => {
    try {
        const res = await fetch('/urls', {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json',
                'X-API-Key': sessionApiKey
            }
        });
        if (!res.ok) {
            if (res.status === 401) {
                // API Key expired or invalid
                sessionStorage.removeItem('apiKey');
                logout();
                return;
            }
            throw new Error('Failed to load shortened links.');
        }
        userUrls = await res.json();
        renderUrlsList(userUrls);

        // Refresh active selection if there is one, otherwise auto-select first link
        if (selectedShortCode) {
            const activeUrlObj = userUrls.find(u => u.short_code === selectedShortCode);
            if (activeUrlObj) {
                selectUrl(activeUrlObj);
            }
        } else if (userUrls.length > 0) {
            selectUrl(userUrls[0]);
        }
    } catch (err) {
        console.error("Error fetching URLs:", err);
    }
};

// ── Render URLs in the list ───────────────────────────────────────────────────
function renderUrlsList(urls) {
    const list = $('urlsList');
    const emptyMsg = $('urlsListEmpty');
    list.innerHTML = '';
    
    if (urls.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    
    emptyMsg.classList.add('hidden');
    urls.forEach(url => {
        const item = document.createElement('div');
        item.className = 'url-item';
        if (selectedShortCode === url.short_code) {
            item.classList.add('selected');
        }
        
        const createdDate = new Date(url.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
        
        item.innerHTML = `
            <div class="url-info-left">
                <span class="url-code">/${url.short_code}</span>
                <span class="url-long" title="${url.long_url}">${url.long_url}</span>
                <span class="url-meta">Created ${createdDate}</span>
            </div>
            <div class="url-info-right">
                <span class="clicks-badge">${url.clicks_count} clicks</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            // Remove previous selections
            document.querySelectorAll('.url-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectUrl(url);
        });
        
        list.appendChild(item);
    });
}

// ── Select a URL to load its detailed stats ──────────────────────────────────
async function selectUrl(url) {
    selectedShortCode = url.short_code;
    
    // UI elements update
    $('analyticsPlaceholder').classList.add('hidden');
    $('analyticsContent').classList.remove('hidden');
    
    $('activeShortCode').textContent = `/${url.short_code}`;
    $('activeLongUrl').textContent = url.long_url;
    
    const createdDate = new Date(url.created_at).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
    $('activeUrlCreated').textContent = `Created ${createdDate}`;
    
    if (url.expires_at) {
        const expDate = new Date(url.expires_at).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        $('activeUrlExpires').textContent = `• Expires ${expDate}`;
    } else {
        $('activeUrlExpires').textContent = '• Never Expires';
    }
    
    // Toggle active status UI
    const statusBadge = $('activeStatus');
    if (url.is_active) {
        statusBadge.textContent = "Active";
        statusBadge.style.borderColor = "var(--success)";
        statusBadge.style.color = "var(--success)";
        statusBadge.style.background = "rgba(16, 185, 129, 0.1)";
    } else {
        statusBadge.textContent = "Inactive";
        statusBadge.style.borderColor = "var(--danger)";
        statusBadge.style.color = "var(--danger)";
        statusBadge.style.background = "rgba(239, 68, 68, 0.1)";
    }
    
    // Load statistics
    await fetchStats(url.short_code);
}

// ── Fetch statistics from backend ─────────────────────────────────────────────
async function fetchStats(code) {
    try {
        const res = await fetch(`/stats/${code}`, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json',
                'X-API-Key': sessionApiKey
            }
        });
        if (!res.ok) throw new Error("Failed to load statistics.");
        const data = await res.json();
        
        $('statTotalClicks').textContent = data.total_clicks;
        $('statUniqueIps').textContent = data.unique_ips;
        
        renderChart(data.clicks_by_day);
        renderBreakdowns(data.top_referrers, data.top_countries);
    } catch (err) {
        console.error("Error loading stats:", err);
    }
}

// ── Render Chart.js line graph ────────────────────────────────────────────────
function renderChart(clicksByDay) {
    const ctx = $('clicksChart').getContext('2d');
    
    // Sort keys chronologically
    const sortedDays = Object.keys(clicksByDay).sort();
    const clickCounts = sortedDays.map(day => clicksByDay[day]);
    
    // Format labels for readable display
    const formattedLabels = sortedDays.map(dayStr => {
        const date = new Date(dayStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    
    if (clicksChartInstance) {
        clicksChartInstance.destroy();
    }
    
    clicksChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Clicks',
                data: clickCounts,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#f59e0b',
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const index = items[0].dataIndex;
                            const fullDate = new Date(sortedDays[index]);
                            return fullDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(241, 226, 209, 0.05)' },
                    ticks: { color: '#DCC3AA', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(241, 226, 209, 0.05)' },
                    ticks: { 
                        color: '#DCC3AA', 
                        font: { family: 'Outfit', size: 10 },
                        precision: 0
                    }
                }
            }
        }
    });
}

// ── Render Country & Referrer progress-bar lists ──────────────────────────────
function renderBreakdowns(referrers, countries) {
    const refList = $('breakdownReferrers');
    const countryList = $('breakdownCountries');
    
    refList.innerHTML = '';
    countryList.innerHTML = '';
    
    // Render referrers
    if (!referrers || referrers.length === 0) {
        refList.innerHTML = '<div class="list-empty" style="padding: 10px 0;">No referrers yet.</div>';
    } else {
        const maxClicks = Math.max(...referrers.map(r => r.count), 1);
        referrers.forEach(r => {
            const pct = (r.count / maxClicks) * 100;
            const item = document.createElement('div');
            item.className = 'breakdown-item';
            item.innerHTML = `
                <div class="breakdown-fill" style="width: ${pct}%"></div>
                <span class="breakdown-name">${r.referrer}</span>
                <span class="breakdown-count">${r.count}</span>
            `;
            refList.appendChild(item);
        });
    }
    
    // Render countries
    if (!countries || countries.length === 0) {
        countryList.innerHTML = '<div class="list-empty" style="padding: 10px 0;">No countries yet.</div>';
    } else {
        const maxClicks = Math.max(...countries.map(c => c.count), 1);
        countries.forEach(c => {
            const pct = (c.count / maxClicks) * 100;
            const item = document.createElement('div');
            item.className = 'breakdown-item';
            item.innerHTML = `
                <div class="breakdown-fill" style="width: ${pct}%"></div>
                <span class="breakdown-name">${c.country}</span>
                <span class="breakdown-count">${c.count}</span>
            `;
            countryList.appendChild(item);
        });
    }
}

// ── Logout ────────────────────────────────────────────────────────────────────
window.logout = () => {
    sessionStorage.clear();
    sessionApiKey = '';
    selectedShortCode = null;
    userUrls = [];
    
    if (clicksChartInstance) {
        clicksChartInstance.destroy();
        clicksChartInstance = null;
    }
    
    $('dashboardPanel').classList.add('hidden');
    $('authPanel').classList.remove('hidden');
    $('mainContainer').classList.remove('dashboard-active');
    
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    
    // Reset analytics views
    $('analyticsContent').classList.add('hidden');
    $('analyticsPlaceholder').classList.remove('hidden');
    $('resultArea').classList.add('hidden');
    $('errorArea').classList.add('hidden');
    
    switchTab('login');
};

// ── On page load: check if already "logged in" for this session ───────────────
(function init() {
    const email = sessionStorage.getItem('email');
    const apiKey = sessionStorage.getItem('apiKey');
    if (email && apiKey) {
        showDashboard(email, apiKey);
    }
})();

// ── Dashboard: Shorten URL ────────────────────────────────────────────────────
$('shortenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('resultArea').classList.add('hidden');
    $('errorArea').classList.add('hidden');
    const btn = $('submitBtn');
    setLoading(btn, true);

    const payload = { long_url: $('longUrl').value };
    const alias = $('customAlias').value.trim();
    const expires = $('expiresIn').value;
    if (alias) payload.custom_alias = alias;
    if (expires) payload.expires_in_days = parseInt(expires, 10);

    try {
        const res = await fetch('/shorten', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': sessionApiKey,
            },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to shorten URL.');

        // Show result box
        $('shortLink').href = data.short_url;
        $('shortLink').textContent = data.short_url;
        $('resultArea').classList.remove('hidden');
        
        // Reset form inputs
        $('longUrl').value = '';
        $('customAlias').value = '';
        $('expiresIn').value = '';
        
        // Auto-refresh list and select the newly created URL
        selectedShortCode = data.short_code;
        await fetchUserUrls();
    } catch (err) {
        showError('errorArea', 'errorMessage', err.message);
    } finally {
        setLoading(btn, false);
    }
});

// ── Copy short URL button ─────────────────────────────────────────────────────
$('copyBtn').addEventListener('click', () => {
    copyToClipboard($('shortLink').href, $('copyBtn'));
});
