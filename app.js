/**
 * Mercle OAuth PWA Demo
 * =====================
 * Demonstrates the Mercle Face ID verification OAuth flow
 */

// ========================================
// Configuration
// ========================================
const CONFIG = {
    clientId: 'app_c4h14v5klle8izb0tauqxrrd',
    clientSecret: 'secret_WI6b0xqhZRRzZjHGJUmmOdt2JYQL3bif', // ⚠️ Exposed for demo only
    redirectUri: 'https://shreyaanp.github.io/mercle-demo/',
    authEndpoint: 'https://id.mercle.ai/oauth/authorize',
    tokenEndpoint: 'https://oauth.mercle.ai/token',          // Fixed: oauth.mercle.ai
    userInfoEndpoint: 'https://oauth.mercle.ai/userinfo'     // Fixed: oauth.mercle.ai
};

// ========================================
// State Management
// ========================================
const STATE_KEY = 'mercle_oauth_state';
const TOKEN_KEY = 'mercle_tokens';

// ========================================
// Utility Functions
// ========================================

/**
 * Generate a random state string for CSRF protection
 */
function generateRandomState() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Show a specific screen and hide others
 */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

/**
 * Update loading text
 */
function setLoadingText(text) {
    document.getElementById('loadingText').textContent = text;
}

/**
 * Display user information
 */
function displayUserInfo(user, tokens) {
    const userInfoEl = document.getElementById('userInfo');

    const fields = [
        { label: 'User ID', value: user.sub || 'N/A' },
        { label: 'Status', value: user.verified ? '<span class="verified-badge">✓ Verified</span>' : 'Not Verified' },
        { label: 'Email', value: user.email || 'Not provided' },
        { label: 'Name', value: user.name || 'Not provided' }
    ];

    // Add any additional fields from the user object
    Object.keys(user).forEach(key => {
        if (!['sub', 'verified', 'email', 'name'].includes(key)) {
            fields.push({
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                value: typeof user[key] === 'object' ? JSON.stringify(user[key]) : user[key]
            });
        }
    });

    userInfoEl.innerHTML = fields.map(field => `
        <div class="user-info-item">
            <span class="user-info-label">${field.label}</span>
            <span class="user-info-value">${field.value}</span>
        </div>
    `).join('');

    // Log full response for debugging
    console.log('Full user response:', user);
    console.log('Tokens:', {
        access_token: tokens.access_token ? '***' + tokens.access_token.slice(-10) : null,
        id_token: tokens.id_token ? '***' + tokens.id_token.slice(-10) : null
    });
}

/**
 * Display error information
 */
function showError(message, details = null) {
    document.getElementById('errorText').textContent = message;
    const errorDetails = document.getElementById('errorDetails');

    if (details) {
        errorDetails.textContent = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
        errorDetails.style.display = 'block';
    } else {
        errorDetails.style.display = 'none';
    }

    showScreen('errorScreen');
}

// ========================================
// OAuth Flow Functions
// ========================================

/**
 * Step 1: Build authorization URL and redirect user
 */
function startVerification() {
    // Generate and store state for CSRF protection
    const state = generateRandomState();
    sessionStorage.setItem(STATE_KEY, state);

    // Build authorization URL with openid profile scope
    const authUrl = `${CONFIG.authEndpoint}?` +
        `client_id=${encodeURIComponent(CONFIG.clientId)}&` +
        `redirect_uri=${encodeURIComponent(CONFIG.redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid profile')}&` +
        `state=${encodeURIComponent(state)}`;

    console.log('Redirecting to:', authUrl);

    // Redirect to Mercle for Face ID verification
    window.location.href = authUrl;
}

/**
 * Step 2 & 3: Handle callback and exchange code for tokens
 */
async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    // Check for OAuth error
    if (error) {
        showError(`OAuth Error: ${error}`, errorDescription);
        return;
    }

    // No code means user just opened the page
    if (!code) {
        return false;
    }

    // Verify state to prevent CSRF
    const savedState = sessionStorage.getItem(STATE_KEY);
    if (!savedState || savedState !== state) {
        showError('Security Error', 'State mismatch - possible CSRF attack. Please try again.');
        sessionStorage.removeItem(STATE_KEY);
        return true;
    }

    // Clean up state
    sessionStorage.removeItem(STATE_KEY);

    // Show loading screen
    showScreen('loadingScreen');
    setLoadingText('Exchanging authorization code...');

    try {
        // Step 3: Exchange code for tokens
        const tokenResponse = await fetch(CONFIG.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code,
                client_id: CONFIG.clientId,
                client_secret: CONFIG.clientSecret,
                redirect_uri: CONFIG.redirectUri
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            throw new Error(`Token exchange failed: ${tokenResponse.status} - ${JSON.stringify(errorData)}`);
        }

        const tokens = await tokenResponse.json();
        console.log('Token response:', tokens);

        // Step 4: Get user info
        setLoadingText('Fetching user information...');

        const userResponse = await fetch(CONFIG.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`
            }
        });

        if (!userResponse.ok) {
            const errorData = await userResponse.json().catch(() => ({}));
            throw new Error(`User info fetch failed: ${userResponse.status} - ${JSON.stringify(errorData)}`);
        }

        const user = await userResponse.json();
        console.log('User response:', user);

        // Store tokens (for demo purposes)
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));

        // Display success
        displayUserInfo(user, tokens);
        showScreen('successScreen');

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
        console.error('OAuth flow error:', err);
        showError('Verification Failed', err.message);
    }

    return true;
}

/**
 * Logout and reset
 */
function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(STATE_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
    showScreen('welcomeScreen');
}

// ========================================
// PWA Installation
// ========================================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').classList.remove('hidden');
});

async function installPWA() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install prompt outcome:', outcome);
    deferredPrompt = null;
    document.getElementById('installBtn').classList.add('hidden');
}

window.addEventListener('appinstalled', () => {
    console.log('PWA installed');
    document.getElementById('installBtn').classList.add('hidden');
});

// ========================================
// Service Worker Registration
// ========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('ServiceWorker registered:', registration.scope);
        } catch (err) {
            console.log('ServiceWorker registration failed:', err);
        }
    });
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Set up button handlers
    document.getElementById('verifyBtn').addEventListener('click', startVerification);
    document.getElementById('retryBtn').addEventListener('click', () => {
        showScreen('welcomeScreen');
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('installBtn').addEventListener('click', installPWA);

    // Check for OAuth callback
    const isCallback = await handleCallback();

    // If not a callback, show welcome screen
    if (!isCallback) {
        showScreen('welcomeScreen');
    }
});

// ========================================
// Debug Helper
// ========================================

window.mercleDebug = {
    config: CONFIG,
    getTokens: () => JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'),
    clearAll: () => {
        sessionStorage.clear();
        window.location.href = CONFIG.redirectUri;
    }
};

console.log('🔐 Mercle Demo loaded. Use window.mercleDebug for debugging.');
