const menuButton = document.querySelector('.menu-button');
const siteNav = document.querySelector('.site-nav');

menuButton?.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
});

siteNav?.addEventListener('click', (event) => {
    if (event.target.matches('a')) {
        siteNav.classList.remove('is-open');
        menuButton?.setAttribute('aria-expanded', 'false');
    }
});

const playerScriptUrl = new URL(document.currentScript?.src ?? window.location.href);
const accountUrl = new URL('../pages/account.html', playerScriptUrl);
const navigation = document.querySelector('.site-nav, .detail-header nav');

if (navigation && !navigation.querySelector('[data-account-link]')) {
    const accountLink = document.createElement('a');
    accountLink.href = accountUrl.href;
    accountLink.dataset.accountLink = '';
    accountLink.textContent = '账户';
    accountLink.setAttribute('aria-label', '登录或申请账户');
    navigation.append(accountLink);
}

const loadAccountScript = (src) => new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) {
        if (existing.dataset.loaded === 'true' || window.getWorSupabase) resolve();
        else {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
        }
        return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
});

const updateNavigationAccount = async () => {
    try {
        if (!window.supabase?.createClient) {
            await loadAccountScript(new URL('./vendor/supabase.js', playerScriptUrl).href);
        }
        if (!window.getWorSupabase) {
            await loadAccountScript(new URL('./supabase-config.js', playerScriptUrl).href);
        }
        const accountClient = window.getWorSupabase();
        const { data: { session } } = await accountClient.auth.getSession();
        if (!session?.user) return;
        const { data: profile } = await accountClient.from('profiles').select('nickname').eq('id', session.user.id).maybeSingle();
        if (!profile?.nickname) return;
        document.querySelectorAll('[data-account-link]').forEach((link) => {
            link.textContent = profile.nickname;
            link.setAttribute('aria-label', `当前账户：${profile.nickname}`);
        });
    } catch {
        // The public site remains usable if the optional account service is unavailable.
    }
};

window.addEventListener('wor:account-updated', (event) => {
    const label = event.detail?.label || '账户';
    document.querySelectorAll('[data-account-link]').forEach((link) => { link.textContent = label; });
});

updateNavigationAccount();

const musicUrl = new URL('../assets/audio/dixies-land-instrumental.mp3', playerScriptUrl);
const musicPlayer = document.createElement('aside');

musicPlayer.className = 'music-player';
musicPlayer.setAttribute('aria-label', '背景音乐播放器');
musicPlayer.innerHTML = `
    <audio preload="metadata" loop src="${musicUrl.href}"></audio>
    <button class="music-player__handle" type="button" aria-label="展开音乐播放器" aria-expanded="false" aria-controls="gramophone-control">♫</button>
    <button id="gramophone-control" class="gramophone-button" type="button" aria-label="播放《Dixie's Land》" aria-pressed="false">
        <span class="gramophone" aria-hidden="true">
            <span class="gramophone__horn"></span>
            <span class="gramophone__neck"></span>
            <span class="gramophone__record"></span>
            <span class="gramophone__needle"></span>
            <span class="gramophone__cabinet"></span>
            <span class="gramophone__crank"></span>
        </span>
        <span class="music-player__state">播放音乐</span>
    </button>
    <span class="music-player__title">Dixie's Land · USMA Band · Public Domain</span>
`;

document.body.append(musicPlayer);

const music = musicPlayer.querySelector('audio');
const musicHandle = musicPlayer.querySelector('.music-player__handle');
const musicButton = musicPlayer.querySelector('.gramophone-button');
const musicState = musicPlayer.querySelector('.music-player__state');
const MUSIC_PREFERENCE_KEY = 'wor_music_preference_v2';
let musicWanted = false;
let lastMusicSave = 0;

const readMusicPreference = () => {
    try {
        return JSON.parse(localStorage.getItem(MUSIC_PREFERENCE_KEY)) || {};
    } catch {
        return {};
    }
};

const saveMusicPreference = (enabled = musicWanted) => {
    musicWanted = enabled;
    try {
        localStorage.setItem(MUSIC_PREFERENCE_KEY, JSON.stringify({
            enabled,
            currentTime: Number.isFinite(music.currentTime) ? music.currentTime : 0,
            savedAt: Date.now()
        }));
    } catch {
        // Music still works when browser storage is unavailable, but cannot persist between pages.
    }
};

const setPlayerExpanded = (isExpanded) => {
    musicPlayer.classList.toggle('is-expanded', isExpanded);
    musicHandle.setAttribute('aria-expanded', String(isExpanded));
};

const updatePlayer = (isPlaying) => {
    musicPlayer.classList.toggle('is-playing', isPlaying);
    musicButton.setAttribute('aria-pressed', String(isPlaying));
    musicButton.setAttribute('aria-label', `${isPlaying ? '暂停' : '播放'}《Dixie's Land》`);
    musicState.textContent = isPlaying ? '正在播放' : '播放音乐';
};

musicButton.addEventListener('click', async () => {
    if (music.paused) {
        musicWanted = true;
        try {
            await music.play();
            saveMusicPreference(true);
        } catch {
            musicState.textContent = '点击继续播放';
        }
    } else {
        musicWanted = false;
        saveMusicPreference(false);
        music.pause();
    }
});

musicHandle.addEventListener('click', () => {
    setPlayerExpanded(true);
    musicButton.focus({ preventScroll: true });
});

document.addEventListener('pointerdown', (event) => {
    if (!musicPlayer.contains(event.target)) {
        setPlayerExpanded(false);
        musicHandle.blur();
        musicButton.blur();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && musicPlayer.classList.contains('is-expanded')) {
        setPlayerExpanded(false);
        musicHandle.blur();
        musicButton.blur();
    }
});

music.addEventListener('play', () => {
    updatePlayer(true);
    saveMusicPreference(true);
});
music.addEventListener('pause', () => updatePlayer(false));
music.addEventListener('timeupdate', () => {
    if (musicWanted && Date.now() - lastMusicSave > 1500) {
        lastMusicSave = Date.now();
        saveMusicPreference(true);
    }
});
music.addEventListener('loadedmetadata', async () => {
    const preference = readMusicPreference();
    musicWanted = preference.enabled === true;
    if (!musicWanted) return;

    const elapsed = Math.max(0, (Date.now() - Number(preference.savedAt || Date.now())) / 1000);
    if (music.duration > 0) {
        music.currentTime = (Number(preference.currentTime || 0) + elapsed) % music.duration;
    }
    try {
        await music.play();
    } catch {
        musicState.textContent = '点击继续播放';
    }
});
window.addEventListener('pagehide', () => saveMusicPreference(musicWanted));
music.addEventListener('error', () => {
    musicPlayer.classList.add('has-error');
    musicButton.disabled = true;
    musicState.textContent = '音乐不可用';
});
