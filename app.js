// Cosmic Daily: a browser for NASA's Astronomy Picture of the Day (APOD).

const API_URL = 'https://api.nasa.gov/planetary/apod';
const FIRST_DATE = '1995-06-16';
const GALLERY_DAYS = 14;
const KEY_STORAGE = 'apodApiKey';
const CACHE_PREFIX = 'apod:';

const $ = (id) => document.getElementById(id);

// --- Storage helpers (storage can be unavailable in private windows) ---

function storageGet(store, key) {
    try { return store.getItem(key); } catch { return null; }
}

function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch { /* ignore */ }
}

function apiKey() {
    return storageGet(localStorage, KEY_STORAGE) || 'DEMO_KEY';
}

// --- Dates ---
// APOD publishes on US Eastern time, so "today" is today in New York.

function todayEastern() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function shiftDate(isoDate, days) {
    const d = new Date(isoDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
    return new Date(isoDate + 'T12:00:00Z').toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
}

function randomDate() {
    const start = Date.parse(FIRST_DATE + 'T12:00:00Z');
    const end = Date.parse(todayEastern() + 'T12:00:00Z');
    const t = start + Math.random() * (end - start);
    return new Date(t).toISOString().slice(0, 10);
}

// --- API ---

async function request(params) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ api_key: apiKey(), thumbs: 'true', ...params });
    const response = await fetch(url);
    if (!response.ok) {
        let message = `NASA API error (${response.status})`;
        if (response.status === 429) {
            message = 'The NASA API rate limit was reached. Add your own free API key under "API key" to keep browsing.';
        } else if (response.status === 403) {
            message = 'NASA rejected the API key. Check it under "API key".';
        } else {
            try {
                const body = await response.json();
                if (body.msg) message = body.msg;
            } catch { /* keep default message */ }
        }
        throw new Error(message);
    }
    return response.json();
}

async function fetchDay(date) {
    const cached = date && storageGet(sessionStorage, CACHE_PREFIX + date);
    if (cached) return JSON.parse(cached);
    const data = await request(date ? { date } : {});
    storageSet(sessionStorage, CACHE_PREFIX + data.date, JSON.stringify(data));
    return data;
}

async function fetchRange(startDate, endDate) {
    const items = await request({ start_date: startDate, end_date: endDate });
    for (const item of items) {
        storageSet(sessionStorage, CACHE_PREFIX + item.date, JSON.stringify(item));
    }
    return items;
}

// --- Rendering (all API text goes through textContent, never innerHTML) ---

function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text != null) node.textContent = text;
    return node;
}

function embedUrl(url) {
    // Normalise YouTube links to the privacy-friendly embed host.
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/embed/')) {
            u.hostname = 'www.youtube-nocookie.com';
            return u.toString();
        }
        return url;
    } catch {
        return url;
    }
}

function renderMedia(container, data) {
    container.replaceChildren();
    container.classList.remove('skeleton');

    if (data.media_type === 'image') {
        const link = el('a', { href: data.hdurl || data.url, target: '_blank', rel: 'noopener' });
        const img = el('img', { src: data.url, alt: data.title });
        container.classList.add('skeleton');
        img.addEventListener('load', () => container.classList.remove('skeleton'), { once: true });
        img.addEventListener('error', () => container.classList.remove('skeleton'), { once: true });
        link.append(img);
        container.append(link);
    } else if (data.media_type === 'video' && /\/embed\/|player\.vimeo\.com/.test(data.url)) {
        const frame = el('iframe', {
            src: embedUrl(data.url),
            title: data.title,
            allow: 'encrypted-media; picture-in-picture; fullscreen',
            allowfullscreen: '',
            loading: 'lazy',
        });
        const wrapper = el('div', { class: 'video' });
        wrapper.append(frame);
        container.append(wrapper);
    } else if (data.media_type === 'video' && /\.(mp4|webm|mov)(\?|$)/i.test(data.url)) {
        const video = el('video', { src: data.url, controls: '', playsinline: '', preload: 'metadata' });
        container.append(video);
    } else {
        const fallback = el('div', { class: 'media-fallback' });
        if (data.thumbnail_url) fallback.append(el('img', { src: data.thumbnail_url, alt: data.title }));
        fallback.append(el('p', {}, "Today's entry can't be shown inline."));
        const href = data.url || `https://apod.nasa.gov/apod/ap${data.date.slice(2).replaceAll('-', '')}.html`;
        fallback.append(el('a', { href, target: '_blank', rel: 'noopener', class: 'button' }, 'View on NASA APOD'));
        container.append(fallback);
    }
}

function apodPageUrl(date) {
    return `https://apod.nasa.gov/apod/ap${date.slice(2).replaceAll('-', '')}.html`;
}

function renderDay(data) {
    renderMedia($('apodMedia'), data);
    $('apodDate').textContent = formatDate(data.date);
    $('apodTitle').textContent = data.title;
    $('apodCredit').textContent = data.copyright ? `© ${data.copyright.replace(/\s+/g, ' ').trim()}` : 'Public domain (NASA)';
    $('apodExplanation').textContent = data.explanation;

    const actions = $('apodActions');
    actions.replaceChildren();
    if (data.hdurl) {
        actions.append(el('a', { href: data.hdurl, target: '_blank', rel: 'noopener', class: 'button' }, 'Full resolution'));
    }
    actions.append(el('a', { href: apodPageUrl(data.date), target: '_blank', rel: 'noopener', class: 'button secondary' }, 'Original page'));
    const share = el('button', { type: 'button', class: 'secondary' }, 'Copy link');
    share.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href);
            share.textContent = 'Copied!';
        } catch {
            share.textContent = 'Copy failed';
        }
        setTimeout(() => { share.textContent = 'Copy link'; }, 1500);
    });
    actions.append(share);

    document.title = `${data.title} — Cosmic Daily`;
    highlightGallery(data.date);
}

function renderError(message) {
    const media = $('apodMedia');
    media.classList.remove('skeleton');
    media.replaceChildren(el('div', { class: 'media-fallback' }, message));
    $('apodDate').textContent = '';
    $('apodTitle').textContent = 'Something went wrong';
    $('apodCredit').textContent = '';
    $('apodExplanation').textContent = message;
    $('apodActions').replaceChildren();
}

function setLoading() {
    const media = $('apodMedia');
    media.replaceChildren();
    media.classList.add('skeleton');
    $('apodTitle').textContent = 'Loading…';
    $('apodDate').textContent = '';
    $('apodCredit').textContent = '';
    $('apodExplanation').textContent = '';
    $('apodActions').replaceChildren();
}

function renderGallery(items) {
    const grid = $('gallery-grid');
    grid.replaceChildren();
    for (const item of items.slice().reverse()) {
        const thumb = item.media_type === 'image' ? item.url : item.thumbnail_url;
        const link = el('a', { href: `?date=${item.date}`, 'data-date': item.date });
        if (thumb) {
            link.append(el('img', { src: thumb, alt: '', loading: 'lazy' }));
        } else {
            link.append(el('div', { class: 'thumb-placeholder' }, item.media_type === 'video' ? '▶' : '✦'));
        }
        const caption = el('span', { class: 'caption' });
        caption.append(el('strong', {}, item.title), el('small', {}, item.date));
        link.append(caption);
        link.addEventListener('click', (event) => {
            event.preventDefault();
            go(item.date);
            $('picture').scrollIntoView({ behavior: 'smooth' });
        });
        const li = el('li');
        li.append(link);
        grid.append(li);
    }
    highlightGallery(currentDate);
}

function highlightGallery(date) {
    for (const link of document.querySelectorAll('#gallery-grid a')) {
        link.classList.toggle('active', link.dataset.date === date);
        if (link.dataset.date === date) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    }
}

// --- Navigation ---

let currentDate = null;
let requestId = 0;

function updateControls() {
    const today = todayEastern();
    const picker = $('datePicker');
    picker.max = today;
    picker.value = currentDate || today;
    $('prevButton').disabled = currentDate === FIRST_DATE;
    $('nextButton').disabled = !currentDate || currentDate >= today;
}

async function load(date) {
    const id = ++requestId;
    setLoading();
    try {
        const data = await fetchDay(date);
        if (id !== requestId) return;
        currentDate = data.date;
        renderDay(data);
    } catch (error) {
        if (id !== requestId) return;
        if (date) currentDate = date;
        renderError(error.message);
    }
    updateControls();
}

function go(date, { replace = false } = {}) {
    const today = todayEastern();
    if (date && (date < FIRST_DATE || date > today)) date = null;
    const url = date && date !== today ? `?date=${date}` : location.pathname;
    history[replace ? 'replaceState' : 'pushState']({ date }, '', url);
    load(date && date !== today ? date : null);
}

function dateFromUrl() {
    const date = new URLSearchParams(location.search).get('date');
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

// --- Wiring ---

$('prevButton').addEventListener('click', () => go(shiftDate(currentDate || todayEastern(), -1)));
$('nextButton').addEventListener('click', () => go(shiftDate(currentDate || todayEastern(), 1)));
$('todayButton').addEventListener('click', () => go(null));
$('randomButton').addEventListener('click', () => go(randomDate()));
$('datePicker').addEventListener('change', (event) => {
    if (event.target.value) go(event.target.value);
});
window.addEventListener('popstate', () => load(dateFromUrl()));

document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, dialog')) return;
    if (event.key === 'ArrowLeft' && !$('prevButton').disabled) $('prevButton').click();
    if (event.key === 'ArrowRight' && !$('nextButton').disabled) $('nextButton').click();
});

const dialog = $('settingsDialog');
$('settingsButton').addEventListener('click', () => {
    $('apiKeyInput').value = storageGet(localStorage, KEY_STORAGE) || '';
    dialog.showModal();
});
dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    const key = $('apiKeyInput').value.trim();
    try {
        if (key) localStorage.setItem(KEY_STORAGE, key);
        else localStorage.removeItem(KEY_STORAGE);
    } catch { /* ignore */ }
    load(currentDate === todayEastern() ? null : currentDate);
    loadGallery();
});

async function loadGallery() {
    const today = todayEastern();
    const range = (end) => fetchRange(shiftDate(end, -(GALLERY_DAYS - 1)), end);
    try {
        // Today's entry may not be published yet; fall back to ending yesterday.
        renderGallery(await range(today).catch(() => range(shiftDate(today, -1))));
    } catch (error) {
        $('gallery-grid').replaceChildren(el('li', { class: 'gallery-error' }, error.message));
    }
}

go(dateFromUrl(), { replace: true });
loadGallery();
