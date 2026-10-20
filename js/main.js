// Durga Pujo Nostalgia - Playlist + Puja utilities

// ============================================================
// YOUTUBE PLAYLIST SETTINGS
// Paste either the Playlist ID OR the full YouTube playlist link.
// ============================================================
const playlists = {
    // Add songs to the 'videos' list below. Each song can be written as:
    //   'VIDEO_ID'                                   (just the ID)
    //   'https://www.youtube.com/watch?v=VIDEO_ID'   (the full link)
    //   { id: 'VIDEO_ID', title: 'My title', icon: 'fa-heart' }   (optional title + icon)
    // Put a comma after every song. The playlist button shows ALL songs.
    'mahalaya': {
        type: 'videos',
        videos: ['YQyo8QeoYhc']
    },

    //'pujo-prem': {
    //    type: 'videos',
    //    videos: ['qAvT2OcMdnk']
    //},

    'pujo-radio': {
        type: 'videos',
        videos: ['fpuadv59iYw']
    }
};

// Kolkata Puja list used for the QR code + clickable link.
const kolkataPujoListUrl = 'https://kolkatakhoj.com/pandals/';

let currentPlaylistKey = 'pujo-radio';
let isPlaying = false;
let player = null;
let progressInterval = null;
let currentPlaylistItems = [];
let titleCache = {};
let lastListSignature = '';
let consecutiveErrors = 0;

function normalizeVideoId(value) {
    if (!value) return '';

    const text = String(value).trim();

    // Plain YouTube video ID
    if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
        return text;
    }

    try {
        const url = new URL(text);

        // Standard watch URL
        if (url.searchParams.get('v')) {
            return url.searchParams.get('v');
        }

        // youtu.be/VIDEO_ID
        if (url.hostname.includes('youtu.be')) {
            return url.pathname.replace('/', '').split('/')[0];
        }

        return '';
    } catch (e) {
        const match = text.match(/[?&]v=([^&]+)/);
        return match ? match[1] : '';
    }
}

function getConfiguredEntries() {
    const config = playlists[currentPlaylistKey];
    if (!config || !Array.isArray(config.videos)) return [];

    return config.videos
        .map(entry => {
            const isObject = entry && typeof entry === 'object';
            return {
                videoId: normalizeVideoId(isObject ? entry.id : entry),
                title: isObject ? (entry.title || '') : '',
                icon: isObject ? (entry.icon || '') : ''
            };
        })
        .filter(entry => entry.videoId);
}

function getConfiguredVideoIds() {
    return getConfiguredEntries().map(entry => entry.videoId);
}

// ============================================================
// Song vibe -> icon
// The music icon in the player (and in the song list) changes
// to match the song. Order matters: the first match wins.
// You can also force an icon for one song with { icon: 'fa-heart' }.
// ============================================================
const tabIcons = {
    'pujo-radio': 'fa-radio',
    'pujo-prem': 'fa-heart',
    'mahalaya': 'fa-om'
};

const vibeIcons = [
    { icon: 'fa-drum', words: ['dhak', 'dhaak', 'dhunuchi', 'ঢাক', 'ধুনুচি'] },
    { icon: 'fa-drum-steelpan', words: ['tabla', 'dholak', 'dhol', 'khol', 'তবলা', 'ঢোল', 'খোল'] },
    { icon: 'fa-bell', words: ['ghanta', 'ghonta', 'bell', 'shankh', 'shankha', 'conch', 'kansor', 'ঘণ্টা', 'শঙ্খ', 'কাঁসর'] },
    { icon: 'fa-wind', words: ['bansuri', 'flute', 'banshi', 'বাঁশি', 'বাঁশুরি'] },
    { icon: 'fa-fire', words: ['aarti', 'arati', 'arotrik', 'আরতি'] },
    { icon: 'fa-om', words: ['mahalaya', 'mahisasura', 'mahishasura', 'chandi', 'stotra', 'mantra', 'bhajan', 'durga', 'মহালয়া', 'মহিষাসুর', 'চণ্ডী', 'স্তোত্র', 'দুর্গা'] },
    { icon: 'fa-water', words: ['bijoya', 'bijaya', 'bisarjan', 'visarjan', 'বিজয়া', 'বিসর্জন'] },
    { icon: 'fa-seedling', words: ['agomoni', 'agomani', 'kashful', 'shiuli', 'shewli', 'sharat', 'shorot', 'আগমনী', 'কাশ', 'শিউলি', 'শরৎ'] },
    { icon: 'fa-heart', words: ['love', 'prem', 'romantic', 'bhalobasa', 'ভালোবাসা', 'প্রেম'] },
    { icon: 'fa-guitar', words: ['guitar', 'acoustic', 'unplugged'] },
    { icon: 'fa-record-vinyl', words: ['remix', 'lofi', 'lo-fi', 'dance', 'party', 'beat'] }
];

function pickVibeIcon(title, author, overrideIcon) {
    if (overrideIcon) {
        const custom = String(overrideIcon).trim().replace(/^fa-solid\s+|^fas\s+/, '');
        const cleaned = custom.startsWith('fa-') ? custom : 'fa-' + custom;
        if (/^fa-[a-z0-9-]+$/.test(cleaned)) return cleaned;
    }

    const text = `${title || ''} ${author || ''}`.toLowerCase();
    for (const vibe of vibeIcons) {
        if (vibe.words.some(word => text.includes(word))) return vibe.icon;
    }
    return tabIcons[currentPlaylistKey] || 'fa-music';
}

function setTrackIcon(iconClass) {
    const box = document.querySelector('.track-icon');
    const iconEl = box ? box.querySelector('i') : null;
    if (!iconEl) return;

    iconEl.className = `fas ${iconClass} pulse-icon`;

    // The animation style follows the icon: vibe-drum, vibe-heart, vibe-om ...
    [...box.classList].forEach(c => { if (c.startsWith('vibe-')) box.classList.remove(c); });
    box.classList.add('vibe-' + iconClass.replace('fa-', ''));
}

function getConfiguredVideoId() {
    return getConfiguredVideoIds()[0] || '';
}

function onYouTubeIframeAPIReady() {
    const playerVars = {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1
    };

    // Only send origin when the page is actually hosted over HTTP(S).
    // For file:// pages, origin:null can cause YouTube Error 153.
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        playerVars.origin = location.origin;
    }

    player = new YT.Player('youtube-iframe', {
        height: '200',
        width: '200',
        playerVars: playerVars,
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
}

function onPlayerReady() {
    console.log('YouTube IFrame API ready');

    try {
        const iframe = player.getIframe?.();
        if (iframe) {
            iframe.setAttribute(
                'allow',
                'autoplay; encrypted-media; picture-in-picture; web-share'
            );
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        }
    } catch (e) {
        console.warn('Could not set YouTube iframe permissions:', e);
    }

    loadSelectedSource();
}

function loadSelectedSource() {
    if (!player) return;

    stopProgressTimer();
    isPlaying = false;
    updatePlayBtnIcon();
    resetProgressUI();

    const entries = getConfiguredEntries();
    const videoIds = entries.map(entry => entry.videoId);
    const status = document.getElementById('playlist-status-text');
    consecutiveErrors = 0;

    currentPlaylistItems = entries.map((entry, index) => ({
        title: entry.title || titleCache[entry.videoId] || `গান ${index + 1}`,
        author: 'YouTube',
        videoId: entry.videoId,
        icon: entry.icon
    }));

    renderSongList(currentPlaylistItems);
    refreshPlaylistItems();

    if (!videoIds.length) {
        setTrackInfo('YouTube Video ID দিন', 'main.js → playlists');
        if (status) status.innerText = 'এই tab-এর videos list খালি';
        return;
    }

    const firstVideoId = videoIds[0];

    setTrackInfo(getPlaylistDisplayName(), 'YouTube');
    setTrackIcon(pickVibeIcon('', '', entries[0].icon));
    if (status) status.innerText = `${getPlaylistDisplayName()} • ${videoIds.length} গান`;

    try {
        /*
         * No YouTube Playlist API is used.
         * We load the first video directly, then Next/Previous use our own
         * video-ID array. This removes the playlist-loading failure entirely.
         */
        player.loadVideoById({
            videoId: firstVideoId,
            startSeconds: 0
        });
    } catch (e) {
        console.error('Direct YouTube video load failed:', e);
        if (status) status.innerText = 'YouTube video load করা যায়নি';
    }
}

function getPlaylistDisplayName() {
    return {
        'mahalaya': 'মহালয়া',
        'pujo-prem': 'পূজো প্রেম',
        'pujo-radio': 'পূজো রেডিও'
    }[currentPlaylistKey] || 'YouTube Playlist';
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        consecutiveErrors = 0;
        isPlaying = true;
        updatePlayBtnIcon();
        startProgressTimer();
        updateTrackInfoFromData();
        refreshPlaylistItems();
        highlightCurrentSong();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        updatePlayBtnIcon();
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        stopProgressTimer();

        // Automatically move to the next video in our own list.
        playNextTrack();
    } else if (event.data === YT.PlayerState.CUED) {
        updateTrackInfoFromData();
        refreshPlaylistItems();
    }
}

function setTrackInfo(name, artist) {
    const nameEl = document.getElementById('current-track-name');
    const artistEl = document.getElementById('current-artist');
    if (nameEl) nameEl.innerText = name;
    if (artistEl) artistEl.innerText = artist;
}

function updateTrackInfoFromData() {
    if (player && player.getVideoData) {
        const data = player.getVideoData();
        if (data && data.title) {
            if (data.video_id) titleCache[data.video_id] = data.title;
            const entry = getConfiguredEntries().find(e => e.videoId === data.video_id);
            setTrackInfo(entry?.title || data.title, data.author || 'YouTube Channel');
            setTrackIcon(pickVibeIcon(data.title, data.author, entry?.icon));
        }
    }
}

function updatePlayBtnIcon() {
    const playBtn = document.getElementById('play-pause-btn');
    if (playBtn) playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    document.querySelector('.track-icon')?.classList.toggle('is-playing', isPlaying);
}

function togglePlay() {
    if (!player) return;

    try {
        if (isPlaying) {
            player.pauseVideo();
            return;
        }

        // User clicked the button, so this is a valid playback gesture.
        player.playVideo();

        // Some browsers/YouTube builds keep a freshly loaded video in CUED
        // state. Retry once from the same user action if it did not transition.
        setTimeout(() => {
            try {
                const state = player.getPlayerState?.();
                if (state !== YT.PlayerState.PLAYING) {
                    const currentId = player.getVideoData?.().video_id;
                    if (currentId) {
                        player.loadVideoById({
                            videoId: currentId,
                            startSeconds: 0
                        });
                    }
                }
            } catch (retryError) {
                console.error('YouTube playback retry failed:', retryError);
            }
        }, 700);

    } catch (e) {
        console.error('Play/Pause failed:', e);
    }
}

function getCurrentVideoIndex() {
    const ids = getConfiguredVideoIds();
    const currentId = player?.getVideoData?.().video_id || '';
    return ids.indexOf(currentId);
}

function playNextTrack() {
    if (!player) return;

    const ids = getConfiguredVideoIds();
    if (!ids.length) return;

    const currentIndex = getCurrentVideoIndex();
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ids.length : 0;

    try {
        player.loadVideoById({
            videoId: ids[nextIndex],
            startSeconds: 0
        });
    } catch (e) {
        console.error('Next track failed:', e);
    }
}

function playPrevTrack() {
    if (!player) return;

    const ids = getConfiguredVideoIds();
    if (!ids.length) return;

    const currentIndex = getCurrentVideoIndex();
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;

    try {
        player.loadVideoById({
            videoId: ids[prevIndex],
            startSeconds: 0
        });
    } catch (e) {
        console.error('Previous track failed:', e);
    }
}

function startProgressTimer() {
    stopProgressTimer();
    progressInterval = setInterval(() => {
        if (!player?.getCurrentTime || !player?.getDuration) return;
        const currentTime = player.getCurrentTime() || 0;
        const duration = player.getDuration() || 0;
        if (duration <= 0) return;

        const pct = (currentTime / duration) * 100;
        const progressBar = document.getElementById('progress-bar');
        const currTimeEl = document.getElementById('current-time');
        const totalDurEl = document.getElementById('total-duration');
        if (progressBar) progressBar.style.width = pct + '%';
        if (currTimeEl) currTimeEl.innerText = formatTime(currentTime);
        if (totalDurEl) totalDurEl.innerText = formatTime(duration);
    }, 500);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function resetProgressUI() {
    document.getElementById('progress-bar')?.style && (document.getElementById('progress-bar').style.width = '0%');
    const currTimeEl = document.getElementById('current-time');
    const totalDurEl = document.getElementById('total-duration');
    if (currTimeEl) currTimeEl.innerText = '0:00';
    if (totalDurEl) totalDurEl.innerText = '0:00';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function toBengaliDigits(number) {
    const bengaliDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return String(number).split('').map(d => bengaliDigits[d] ?? d).join('');
}

// ============================================================
// Automatic playlist song list
// No YouTube Data API key is required. We first read the playlist
// video IDs from the IFrame player and then try YouTube oEmbed for
// human-readable titles. If oEmbed is unavailable, numbered tracks
// are still shown and remain playable.
// ============================================================
async function fetchSongTitle(videoId) {
    if (titleCache[videoId]) return titleCache[videoId];
    try {
        const url = 'https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent('https://www.youtube.com/watch?v=' + videoId);
        const response = await fetch(url);
        if (!response.ok) return '';
        const data = await response.json();
        if (data && data.title) titleCache[videoId] = data.title;
        return titleCache[videoId] || '';
    } catch (e) {
        return '';
    }
}

async function refreshPlaylistItems() {
    const startKey = currentPlaylistKey;
    const entries = getConfiguredEntries();

    await Promise.all(entries.map(entry => entry.title ? null : fetchSongTitle(entry.videoId)));
    if (startKey !== currentPlaylistKey) return; // another tab was chosen meanwhile

    const items = entries.map((entry, index) => ({
        title: entry.title || titleCache[entry.videoId] || `গান ${index + 1}`,
        author: 'YouTube',
        videoId: entry.videoId,
        icon: entry.icon
    }));

    const signature = items.map(item => item.videoId + '|' + item.title).join('~');
    if (signature !== lastListSignature) {
        currentPlaylistItems = items;
        renderSongList(items);
    } else {
        highlightCurrentSong();
    }
}

function refreshPlaylistDrawer() {
    // Playlist drawer is populated directly from playlists[].videos.
    // No YouTube Playlist API is required.
    refreshPlaylistItems();
}

async function loadPlaylistSongList() {
    refreshPlaylistItems();
}

function renderSongList(items) {
    const list = document.getElementById('song-list');
    if (!list) return;

    list.innerHTML = '';
    lastListSignature = items.map(item => item.videoId + '|' + item.title).join('~');
    if (!items.length) {
        const li = document.createElement('li');
        li.className = 'song-item empty-song-list';
        li.innerText = 'Playlist-এর গান এখানে দেখা যাবে';
        list.appendChild(li);
        return;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'song-item';
        li.dataset.videoId = item.videoId;
        const rowIcon = pickVibeIcon(item.title, '', item.icon);
        li.innerHTML = `<span class="song-number">${toBengaliDigits(index + 1)}</span><span class="song-icon"><i class="fas ${rowIcon}"></i></span><span class="song-title">${escapeHtml(item.title)}</span>`;
        li.addEventListener('click', () => playSongFromList(item.videoId));
        list.appendChild(li);
    });

    highlightCurrentSong();
}

function playSongFromList(videoId) {
    if (!player || !videoId) return;

    try {
        player.loadVideoById({
            videoId: videoId,
            startSeconds: 0
        });
    } catch (e) {
        console.error('Could not play selected YouTube video:', e);
    }

    setTimeout(highlightCurrentSong, 250);
}

function onPlayerError(event) {
    console.error('YouTube IFrame Player Error:', event.data);

    const status = document.getElementById('playlist-status-text');

    const errors = {
        2: 'YouTube Error 2 — Video ID / request invalid',
        5: 'YouTube Error 5 — HTML5 player error',
        100: 'YouTube Error 100 — Video পাওয়া যায়নি / Private / Removed',
        101: 'YouTube Error 101 — এই video অন্য website-এ embed করা নিষিদ্ধ',
        150: 'YouTube Error 150 — এই video অন্য website-এ embed করা নিষিদ্ধ',
        153: 'YouTube Error 153 — YouTube এই embedded request-এর Referer/Origin পাচ্ছে না'
    };

    if (status) {
        status.innerText = errors[event.data] || `YouTube playback error (${event.data})`;
    }

    // If a song can't be played on websites (100 / 101 / 150), skip to the next one.
    // Stops by itself if every song in the list fails.
    if ([100, 101, 150].includes(event.data)) {
        consecutiveErrors++;
        if (consecutiveErrors < getConfiguredVideoIds().length) {
            setTimeout(playNextTrack, 1200);
        }
    }
}

function highlightCurrentSong() {
    const activeId = player?.getVideoData?.().video_id;
    document.querySelectorAll('.song-item').forEach(item => {
        const isActive = !!activeId && item.dataset.videoId === activeId;
        item.classList.toggle('active', isActive);
        if (isActive && document.getElementById('playlist-drawer')?.classList.contains('open')) {
            item.scrollIntoView({ block: 'nearest' });
        }
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

// ============================================================
// Modal helpers
// ============================================================
function setupModal(buttonId, modalId, closeSelector) {
    const button = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    const close = document.querySelector(closeSelector);
    button?.addEventListener('click', () => modal?.classList.add('show'));
    close?.addEventListener('click', () => modal?.classList.remove('show'));
    modal?.addEventListener('click', event => {
        if (event.target === modal) modal.classList.remove('show');
    });
    return modal;
}

function createPujaQrCode() {
    const canvas = document.getElementById('puja-qr-code');
    const link = document.getElementById('puja-list-link');
    if (link) link.href = kolkataPujoListUrl;

    if (canvas && window.QRious) {
        new QRious({
            element: canvas,
            value: kolkataPujoListUrl,
            size: 210,
            level: 'H',
            background: 'white',
            foreground: '#17131b'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Visitor Tracking
    try {
        const channel = new BroadcastChannel('active_page_visitors');
        const tabId = Math.random().toString(36).substring(2);
        const activeTabs = new Set([tabId]);

        function updateVisitorUI() {
            const el = document.getElementById('visitor-count');
            if (el) el.innerText = toBengaliDigits(activeTabs.size);
        }

        channel.postMessage({ type: 'JOIN', id: tabId });
        updateVisitorUI();

        channel.onmessage = event => {
            if (event.data.type === 'JOIN') {
                activeTabs.add(event.data.id);
                channel.postMessage({ type: 'ACK', id: tabId });
                updateVisitorUI();
            } else if (event.data.type === 'ACK') {
                activeTabs.add(event.data.id);
                updateVisitorUI();
            } else if (event.data.type === 'LEAVE') {
                activeTabs.delete(event.data.id);
                updateVisitorUI();
            }
        };

        window.addEventListener('beforeunload', () => channel.postMessage({ type: 'LEAVE', id: tabId }));
    } catch (e) {
        console.warn('Visitor counter is not available in this browser.');
    }

    // Center Live Clock
    function updateCenterClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;

        document.getElementById('clock-hours').innerText = hours < 10 ? '0' + hours : hours;
        document.getElementById('clock-minutes').innerText = minutes < 10 ? '0' + minutes : minutes;
        document.getElementById('clock-ampm').innerText = ampm;
    }
    setInterval(updateCenterClock, 1000);
    updateCenterClock();

    // Pujo Countdown — to Mahalaya / puja season start
   // function updatePujoCountdown() {
    //    const currentYear = new Date().getFullYear();
    //    let pujoTarget = new Date(currentYear, 9, 15);
    //    const now = new Date();
    //    if (now > pujoTarget) pujoTarget = new Date(currentYear + 1, 9, 16);

    //    const diffTime = Math.max(0, pujoTarget - now);
    //    const days = Math.floor(diffTime / 86400000);
    //    const hours = Math.floor((diffTime % 86400000) / 3600000);
    //    const minutes = Math.floor((diffTime % 3600000) / 60000);
    //    const countdownStr = `${toBengaliDigits(days)} দিন ${toBengaliDigits(hours < 10 ? '0' + hours : hours)} ঘণ্টা ${toBengaliDigits(minutes < 10 ? '0' + minutes : minutes)} মিনিট`;
    //    document.getElementById('pujo-countdown').innerText = countdownStr;
    //}
    //setInterval(updatePujoCountdown, 60000);
    //updatePujoCountdown();

    // Dhak: click once = start looping, click again = stop
    const dhakTrigger = document.getElementById('dhak-sound-trigger');
    const dhakAudio = document.getElementById('dhak-audio');

    function triggerDhak() {
        if (!dhakAudio) return;
        if (dhakAudio.paused) {
            dhakAudio.loop = true;
            dhakAudio.play().catch(e => console.log('Dhak playback prevented', e));
            dhakTrigger?.classList.add('dhak-playing');
        } else {
            dhakAudio.pause();
            dhakAudio.currentTime = 0;
            dhakTrigger?.classList.remove('dhak-playing');
        }
        if (dhakTrigger) {
            dhakTrigger.style.transform = 'scale(0.92)';
            setTimeout(() => dhakTrigger.style.transform = '', 150);
        }
    }
    dhakTrigger?.addEventListener('click', triggerDhak);

    // Existing Profile Modal
    setupModal('profile-btn', 'profile-modal', '.profile-modal .close-btn');
    const profileModal = document.getElementById('profile-modal');
    profileModal?.querySelector('.close-btn')?.addEventListener('click', () => profileModal.classList.remove('show'));

    // New Puja Nirghonto + QR modals
    setupModal('nirghonto-btn', 'nirghonto-modal', '.nirghonto-close');
    const qrModal = setupModal('puja-list-btn', 'puja-list-modal', '.puja-list-close');
    createPujaQrCode();
    qrModal?.addEventListener('click', event => {
        if (event.target === qrModal) qrModal.classList.remove('show');
    });

    // Close any open modal with Escape
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    });

    // Player Controls
    document.getElementById('play-pause-btn')?.addEventListener('click', togglePlay);
    document.getElementById('next-btn')?.addEventListener('click', playNextTrack);
    document.getElementById('prev-btn')?.addEventListener('click', playPrevTrack);

    // Playlist drawer
    const drawer = document.getElementById('playlist-drawer');
    document.getElementById('toggle-playlist-btn')?.addEventListener('click', () => drawer?.classList.toggle('open'));
    document.getElementById('close-drawer')?.addEventListener('click', () => drawer?.classList.remove('open'));

    // Playlist tabs — all three are configured in this file
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            const selectedTab = tab.dataset.playlist;
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentPlaylistKey = selectedTab;
            loadSelectedSource();
        });
    });

    // Progress bar click-to-seek
    document.getElementById('progress-wrap')?.addEventListener('click', event => {
        if (!player?.getDuration) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        player.seekTo(ratio * player.getDuration(), true);
    });
});
