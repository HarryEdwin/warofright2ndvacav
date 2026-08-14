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
const musicUrl = new URL('../assets/audio/dixies-land-instrumental.mp3', playerScriptUrl);
const musicPlayer = document.createElement('aside');

musicPlayer.className = 'music-player';
musicPlayer.setAttribute('aria-label', '背景音乐播放器');
musicPlayer.innerHTML = `
    <audio preload="metadata" src="${musicUrl.href}"></audio>
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
        try {
            await music.play();
        } catch {
            musicState.textContent = '无法播放';
        }
    } else {
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

music.addEventListener('play', () => updatePlayer(true));
music.addEventListener('pause', () => updatePlayer(false));
music.addEventListener('ended', () => updatePlayer(false));
music.addEventListener('error', () => {
    musicPlayer.classList.add('has-error');
    musicButton.disabled = true;
    musicState.textContent = '音乐不可用';
});
