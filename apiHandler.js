var LS_SEARCH_HIST = 'qoovy_search_history';
var LS_PLAY_HIST   = 'qoovy_play_history';

var API_KEY = '';
var tracks = [];
var curIdx = -1;
var isPlaying = false;
var isShuffle = false;
// repeatMode: 0=off, 1=all, 2=one
var repeatMode = 0;
var isMuted = false;
var adBlockEnabled = true;
var volLevel = 80;

// Shuffle queue
var shuffleQueue = [];
var shufflePos = 0;

var musicQueue = [];

var searchHistory = [];

// Play history
var playHistory = [];

var progTimer = null;
var simCur = 0;
var simDur = 0;

var adCountdownTimer = null;
var adCountVal = 5;
var isAdShowing = false;

var ytAPIReady = false;
var infoRequestTimer = null;
var adWatchTimer = null;

var CORS_PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/get?url=',
];
var corsProxyIdx = 0;

var mobilePlaylistOpen = false;
var activeTab = 'playlist';

// LOAD FROM LOCALSTORAGE //
function loadFromStorage() {
  try {
    var sh = localStorage.getItem(LS_SEARCH_HIST);
    if (sh) searchHistory = JSON.parse(sh);
  } catch(e) { searchHistory = []; }
  try {
    var ph = localStorage.getItem(LS_PLAY_HIST);
    if (ph) playHistory = JSON.parse(ph);
  } catch(e) { playHistory = []; }
  updateHistoryBadge();
}

function saveSearchHistory() {
  try { localStorage.setItem(LS_SEARCH_HIST, JSON.stringify(searchHistory)); } catch(e) {}
}

function savePlayHistory() {
  try { localStorage.setItem(LS_PLAY_HIST, JSON.stringify(playHistory)); } catch(e) {}
}

// SIDEBAR TABS
function switchTab(tab) {
  activeTab = tab;
  ['playlist','queue','history'].forEach(function(t) {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('panel-' + t).classList.toggle('active', t === tab);
  });
}

// MOBILE PLAYLIST
function toggleMobilePlaylist() {
  mobilePlaylistOpen = !mobilePlaylistOpen;
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('mobile-sheet-overlay');
  var toggleBtn = document.getElementById('mobile-playlist-toggle');
  var label = document.getElementById('mob-toggle-label');
  if (mobilePlaylistOpen) {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('show');
    toggleBtn.classList.add('open');
    label.textContent = 'Tutup';
  } else {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
    toggleBtn.classList.remove('open');
    label.textContent = 'Playlist';
  }
}
function closeMobilePlaylist() {
  if (mobilePlaylistOpen) toggleMobilePlaylist();
}

// SEARCH HISTORY
function addSearchHistory(q) {
  searchHistory = searchHistory.filter(function(s) { return s !== q; });
  searchHistory.unshift(q);
  if (searchHistory.length > 15) searchHistory = searchHistory.slice(0, 15);
  saveSearchHistory();
}

function deleteSearchHistory(q) {
  searchHistory = searchHistory.filter(function(s) { return s !== q; });
  saveSearchHistory();
  showSearchDropdown();
}

function clearSearchHistory() {
  searchHistory = [];
  saveSearchHistory();
  hideSearchDropdown();
}

function onSearchInput() {
  showSearchDropdown();
}

function onSearchKeydown(e) {
  if (e.key === 'Enter') {
    hideSearchDropdown();
    doSearch();
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
  }
}

function showSearchDropdown() {
  var input = document.getElementById('search-input');
  var val = input.value.trim().toLowerCase();
  var dropdown = document.getElementById('search-history-dropdown');
  var filtered = val
    ? searchHistory.filter(function(s) { return s.toLowerCase().includes(val); })
    : searchHistory;
  if (!filtered.length) { hideSearchDropdown(); return; }
  var html = filtered.map(function(s) {
    return '<div class="sh-item">'
      + '<div class="sh-item-text" onclick="selectSearchHistory(\'' + esc(s) + '\')">'
      + '<svg class="sh-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      + esc(s)
      + '</div>'
      + '<button class="sh-del" onclick="event.stopPropagation();deleteSearchHistory(\'' + esc(s) + '\')" title="Hapus">x</button>'
      + '</div>';
  }).join('');
  html += '<div class="sh-clear-row" onclick="clearSearchHistory()">Hapus Semua Riwayat</div>';
  dropdown.innerHTML = html;
  dropdown.classList.add('show');
}

function hideSearchDropdown() {
  document.getElementById('search-history-dropdown').classList.remove('show');
}

function selectSearchHistory(q) {
  document.getElementById('search-input').value = q;
  hideSearchDropdown();
  doSearch();
}

document.addEventListener('click', function(e) {
  var section = document.querySelector('.search-section');
  if (section && !section.contains(e.target)) hideSearchDropdown();
});

// PLAY HISTORY
function addPlayHistory(track) {
  var entry = {
    id: track.id, title: track.title, ch: track.ch, thumb: track.thumb,
    ts: Date.now()
  };
  // Remove duplicate
  playHistory = playHistory.filter(function(h) { return h.id !== track.id; });
  playHistory.unshift(entry);
  if (playHistory.length > 50) playHistory = playHistory.slice(0, 50);
  savePlayHistory();
  renderHistoryList();
  updateHistoryBadge();
}

function clearPlayHistory() {
  playHistory = [];
  savePlayHistory();
  renderHistoryList();
  updateHistoryBadge();
  toast('Riwayat dihapus');
}

function updateHistoryBadge() {
  var el = document.getElementById('badge-history');
  if (el) el.textContent = playHistory.length;
}

function renderHistoryList() {
  var list = document.getElementById('history-list');
  if (!playHistory.length) {
    list.innerHTML = '<div class="empty-wrap">'
      + '<div class="empty-icon-wrap"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>'
      + '<div class="empty-title">Belum ada riwayat</div>'
      + '<div class="empty-sub">Lagu yang diputar akan muncul di sini</div>'
      + '</div>';
    return;
  }
  var html = playHistory.map(function(h, i) {
    var timeStr = fmtRelTime(h.ts);
    return '<div class="hist-item" onclick="playFromHistory(' + i + ')">'
      + '<img class="track-thumb" src="' + esc(h.thumb) + '" alt="" onerror="this.style.background=\'#2a2a3a\'" loading="lazy"/>'
      + '<div class="track-info">'
      + '<div class="track-title">' + esc(h.title) + '</div>'
      + '<div class="track-ch">' + esc(h.ch) + '</div>'
      + '</div>'
      + '<span class="hist-time">' + timeStr + '</span>'
      + '</div>';
  }).join('');
  list.innerHTML = html;
}

function playFromHistory(i) {
  var h = playHistory[i];
  if (!h) return;
  // Add to tracks if not present
  var exists = tracks.findIndex(function(t) { return t.id === h.id; });
  if (exists >= 0) {
    playTrack(exists);
  } else {
    tracks.unshift({ id: h.id, title: h.title, ch: h.ch, thumb: h.thumb });
    renderTracks();
    playTrack(0);
  }
  if (window.innerWidth <= 640) setTimeout(closeMobilePlaylist, 200);
}

function fmtRelTime(ts) {
  var diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return Math.floor(diff/60) + 'm lalu';
  if (diff < 86400) return Math.floor(diff/3600) + 'j lalu';
  return Math.floor(diff/86400) + 'h lalu';
}

// ═══════════════════════════════════════════
//  MUSIC QUEUE
// ═══════════════════════════════════════════
function addToQueue(track, showToast) {
  musicQueue.push(track);
  renderQueueList();
  updateQueueBadge();
  if (showToast !== false) toast('"' + track.title.substring(0, 30) + '..." ditambah ke antrean');
  var pill = document.getElementById('pill-queue');
  if (pill) { pill.textContent = 'Queue: ' + musicQueue.length; pill.classList.add('show'); }
}

function removeFromQueue(i) {
  musicQueue.splice(i, 1);
  renderQueueList();
  updateQueueBadge();
  var pill = document.getElementById('pill-queue');
  if (pill) {
    if (musicQueue.length > 0) { pill.textContent = 'Queue: ' + musicQueue.length; pill.classList.add('show'); }
    else { pill.classList.remove('show'); }
  }
}

function clearQueue() {
  musicQueue = [];
  renderQueueList();
  updateQueueBadge();
  var pill = document.getElementById('pill-queue');
  if (pill) pill.classList.remove('show');
  toast('Antrean dikosongkan');
}

function updateQueueBadge() {
  var el = document.getElementById('badge-queue');
  if (el) el.textContent = musicQueue.length;
}

function renderQueueList() {
  var list = document.getElementById('queue-list');
  if (!musicQueue.length) {
    list.innerHTML = '<div class="empty-wrap">'
      + '<div class="empty-icon-wrap"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div>'
      + '<div class="empty-title">Antrean kosong</div>'
      + '<div class="empty-sub">Tekan + pada lagu untuk menambah ke antrean</div>'
      + '</div>';
    return;
  }
  var html = musicQueue.map(function(t, i) {
    return '<div class="queue-item">'
      + '<span class="queue-order">' + (i+1) + '</span>'
      + '<img class="track-thumb" src="' + esc(t.thumb) + '" alt="" onerror="this.style.background=\'#2a2a3a\'" loading="lazy"/>'
      + '<div class="track-info">'
      + '<div class="track-title">' + esc(t.title) + '</div>'
      + '<div class="track-ch">' + esc(t.ch) + '</div>'
      + '</div>'
      + '<button class="btn-queue-remove" onclick="removeFromQueue(' + i + ')" title="Hapus dari antrean">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '</div>';
  }).join('');
  list.innerHTML = html;
}

// SHUFFLE (Fisher-Yates)
function buildShuffleQueue(currentIdx) {
  var indices = [];
  for (var i = 0; i < tracks.length; i++) {
    if (i !== currentIdx) indices.push(i);
  }
  // Fisher-Yates shuffle
  for (var j = indices.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = indices[j]; indices[j] = indices[k]; indices[k] = tmp;
  }
  // Put current at front
  if (currentIdx >= 0) indices.unshift(currentIdx);
  shuffleQueue = indices;
  shufflePos = 0;
}

function getNextShuffleIdx() {
  if (!shuffleQueue.length) buildShuffleQueue(curIdx);
  shufflePos++;
  if (shufflePos >= shuffleQueue.length) {
    buildShuffleQueue(-1);
    shufflePos = 0;
  }
  return shuffleQueue[shufflePos] !== undefined ? shuffleQueue[shufflePos] : 0;
}

function getPrevShuffleIdx() {
  if (shufflePos > 0) shufflePos--;
  return shuffleQueue[shufflePos] !== undefined ? shuffleQueue[shufflePos] : 0;
}

// YOUTUBE IFRAME
function buildIframeSrc(videoId, autoplay) {
  var origin = window.location.origin || 'http://localhost';
  var auto = autoplay ? 1 : 0;
  return 'https://www.youtube-nocookie.com/embed/' + videoId
    + '?autoplay=' + auto + '&enablejsapi=1&controls=0&modestbranding=1'
    + '&rel=0&iv_load_policy=3&playsinline=1&cc_load_policy=0'
    + '&origin=' + encodeURIComponent(origin)
    + '&fs=0&hl=id&color=white';
}

function ytCmd(func, args) {
  var iframe = document.getElementById('yt-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(JSON.stringify({ event:'command', func:func, args:args||[] }), '*');
  } catch(e) {}
}

window.addEventListener('message', function(e) {
  if (!e.origin.includes('youtube')) return;
  try {
    var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (data.event === 'onReady') {
      ytAPIReady = true;
      ytCmd('setVolume', [isMuted ? 0 : volLevel]);
      hideLdr();
    }
    if (data.event === 'onStateChange') handleStateChange(data.info);
    if (data.event === 'infoDelivery' && data.info) {
      if (data.info.currentTime !== undefined && data.info.duration !== undefined) {
        simCur = data.info.currentTime;
        simDur = data.info.duration;
        updateProgressUI();
      }
      if (adBlockEnabled && data.info.videoData) {
        var playingId = data.info.videoData.video_id;
        if (curIdx >= 0 && tracks[curIdx] && playingId && playingId !== tracks[curIdx].id) {
          if (!isAdShowing) triggerAdOverlay();
        } else { if (isAdShowing) hideAdOverlay(); }
      }
    }
  } catch(e2) {}
});

function handleStateChange(state) {
  if (state === 1) {
    setPlayState(true); hideLdr(); startProgTimer();
    if (isAdShowing) hideAdOverlay();
  } else if (state === 2) {
    setPlayState(false); stopProgTimer();
  } else if (state === 0) {
    setPlayState(false); stopProgTimer();
    handleTrackEnd();
  } else if (state === 3) {
    showLdr();
  } else if (state === -1 || state === 5) {
    hideLdr();
  }
}

function handleTrackEnd() {
  if (repeatMode === 2) {
    // Repeat one
    reloadCurrentTrack();
  } else if (musicQueue.length > 0) {
    // Play from queue first
    var next = musicQueue.shift();
    renderQueueList();
    updateQueueBadge();
    var pill = document.getElementById('pill-queue');
    if (pill) {
      if (musicQueue.length > 0) { pill.textContent = 'Queue: ' + musicQueue.length; pill.classList.add('show'); }
      else { pill.classList.remove('show'); }
    }
    // Find track in playlist or play directly
    var idx = tracks.findIndex(function(t) { return t.id === next.id; });
    if (idx >= 0) playTrack(idx);
    else { tracks.push(next); renderTracks(); playTrack(tracks.length - 1); }
  } else {
    nextTrack();
  }
}

function startInfoRequests() {
  stopInfoRequests();
  infoRequestTimer = setInterval(function() {
    ytCmd('getVideoData', []);
    var iframe = document.getElementById('yt-iframe');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id:1, channel:'widget' }), '*');
      } catch(e) {}
    }
  }, 1500);
}
function stopInfoRequests() {
  if (infoRequestTimer) { clearInterval(infoRequestTimer); infoRequestTimer = null; }
}

// PROGRESS
var progLastUpdate = 0;
function startProgTimer() {
  stopProgTimer();
  progTimer = setInterval(function() {
    if (!isPlaying) return;
    simCur += 0.9;
    if (simDur > 0 && simCur > simDur) simCur = simDur;
    updateProgressUI();
    progLastUpdate++;
    if (progLastUpdate % 5 === 0) {
      var iframe = document.getElementById('yt-iframe');
      if (iframe && iframe.contentWindow) {
        try { iframe.contentWindow.postMessage(JSON.stringify({ event:'command', func:'getCurrentTime', args:[] }), '*'); } catch(e) {}
      }
    }
  }, 900);
}
function stopProgTimer() {
  if (progTimer) { clearInterval(progTimer); progTimer = null; }
}
function updateProgressUI() {
  if (simDur > 0) {
    var pct = Math.min(100, (simCur / simDur) * 100);
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('t-cur').textContent = fmt(simCur);
    document.getElementById('t-dur').textContent = fmt(simDur);
  }
}
function fmt(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s/60) + ':' + ('0' + (s%60)).slice(-2);
}
function seekTo(e) {
  var rect = document.getElementById('prog-track').getBoundingClientRect();
  var clientX = e.touches ? e.touches[0].clientX : e.clientX;
  var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  var seekSec = pct * (simDur || 300);
  simCur = seekSec;
  ytCmd('seekTo', [seekSec, true]);
  updateProgressUI();
}

// AD BLOCKER
function triggerAdOverlay() {
  if (!adBlockEnabled) return;
  isAdShowing = true;
  document.getElementById('ad-overlay').classList.add('show');
  adCountVal = 5;
  document.getElementById('ad-countdown').textContent = adCountVal;
  clearInterval(adCountdownTimer);
  adCountdownTimer = setInterval(function() {
    adCountVal--;
    document.getElementById('ad-countdown').textContent = adCountVal;
    if (adCountVal <= 0) { clearInterval(adCountdownTimer); skipAdNow(); }
  }, 1000);
}
function skipAdNow() {
  clearInterval(adCountdownTimer);
  ytCmd('playVideo', []); ytCmd('seekTo', [9999, true]);
  setTimeout(function() { if (isAdShowing && curIdx >= 0) reloadCurrentTrack(); }, 800);
}
function hideAdOverlay() {
  isAdShowing = false; clearInterval(adCountdownTimer);
  document.getElementById('ad-overlay').classList.remove('show');
}
function toggleAdBlock() {
  adBlockEnabled = !adBlockEnabled;
  var badge = document.getElementById('adb-badge');
  var lbl = document.getElementById('adb-label');
  var pill = document.getElementById('pill-adblock');
  if (adBlockEnabled) {
    badge.classList.remove('off'); lbl.textContent = 'AD-FREE ON';
    pill.classList.remove('off'); pill.textContent = 'AdBlock ON';
    toast('AdBlock aktif');
  } else {
    badge.classList.add('off'); lbl.textContent = 'AD-FREE OFF';
    pill.classList.add('off'); pill.textContent = 'AdBlock OFF';
    if (isAdShowing) hideAdOverlay();
    toast('AdBlock dimatikan');
  }
}
function startAdWatch(videoId) {
  stopAdWatch();
  if (!adBlockEnabled) return;
  var checks = 0;
  adWatchTimer = setInterval(function() {
    checks++;
    if (checks === 2 && adBlockEnabled && !isPlaying) {
      ytCmd('cancelPlayback', []);
      setTimeout(function() { if (curIdx >= 0 && !isPlaying) reloadCurrentTrack(); }, 500);
    }
    if (checks > 6) stopAdWatch();
  }, 2000);
}
function stopAdWatch() {
  if (adWatchTimer) { clearInterval(adWatchTimer); adWatchTimer = null; }
}

// PLAYBACK
function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  curIdx = idx;
  var t = tracks[idx];

  simCur = 0; simDur = 0;
  ytAPIReady = false; isPlaying = false;
  stopProgTimer(); hideAdOverlay();

  document.getElementById('idle-view').style.display = 'none';
  document.getElementById('player-view').style.display = 'block';
  document.getElementById('idle-disc').classList.add('spin');
  showLdr();

  var iframe = document.getElementById('yt-iframe');
  iframe.src = buildIframeSrc(t.id, true);

  document.getElementById('np-title').textContent = t.title;
  document.getElementById('np-ch').textContent = t.ch;
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('t-cur').textContent = '0:00';
  document.getElementById('t-dur').textContent = '0:00';

  addPlayHistory(t);
  renderTracks();
  scrollToTrack(idx);
  startInfoRequests();
  startAdWatch(t.id);

  setTimeout(function() { if (curIdx === idx) hideLdr(); }, 6000);
  setTimeout(function() {
    if (curIdx === idx && !isPlaying) {
      setPlayState(true);
      if (simDur === 0) simDur = 240;
      startProgTimer();
    }
  }, 4000);
}

function reloadCurrentTrack() {
  if (curIdx < 0) return;
  simCur = 0;
  var iframe = document.getElementById('yt-iframe');
  iframe.src = buildIframeSrc(tracks[curIdx].id, true);
  showLdr(); hideAdOverlay();
}

function togglePlay() {
  if (curIdx < 0) { if (tracks.length > 0) playTrack(0); return; }
  if (isPlaying) {
    ytCmd('pauseVideo', []); setPlayState(false); stopProgTimer();
  } else {
    ytCmd('playVideo', []); setPlayState(true); startProgTimer();
  }
}

function prevTrack() {
  if (!tracks.length) return;
  var idx;
  if (isShuffle) {
    idx = getPrevShuffleIdx();
  } else {
    idx = (curIdx - 1 + tracks.length) % tracks.length;
  }
  playTrack(idx);
}

function nextTrack() {
  if (!tracks.length) return;
  // Queue takes priority
  if (musicQueue.length > 0) { handleTrackEnd(); return; }
  var idx;
  if (isShuffle) {
    idx = getNextShuffleIdx();
  } else {
    if (repeatMode === 1) {
      idx = (curIdx + 1) % tracks.length;
    } else {
      idx = curIdx + 1;
      if (idx >= tracks.length) { toast('Playlist selesai'); setPlayState(false); return; }
    }
  }
  playTrack(idx);
}

function setPlayState(state) {
  isPlaying = state;
  document.getElementById('ico-play').style.display = state ? 'none' : 'block';
  document.getElementById('ico-pause').style.display = state ? 'block' : 'none';
  var disc = document.getElementById('idle-disc');
  if (state) disc.classList.add('spin'); else disc.classList.remove('spin');
}

// SHUFFLE
function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuf').classList.toggle('lit', isShuffle);
  if (isShuffle) {
    buildShuffleQueue(curIdx);
    toast('Acak: ON — urutan baru diacak');
  } else {
    shuffleQueue = []; shufflePos = 0;
    toast('Acak: OFF');
  }
}

// REPEAT (3 modes)
function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  var btn = document.getElementById('btn-rep');
  var badge = document.getElementById('repeat-badge');
  btn.classList.remove('lit', 'repeat-one', 'lit-yellow');
  if (repeatMode === 0) {
    toast('Ulangi: OFF');
  } else if (repeatMode === 1) {
    btn.classList.add('lit');
    toast('Ulangi: Semua');
  } else if (repeatMode === 2) {
    btn.classList.add('lit', 'repeat-one');
    toast('Ulangi: Satu lagu');
  }
}

// VOLUME
function onVolSlider(v) {
  volLevel = Number(v);
  if (!isMuted) ytCmd('setVolume', [volLevel]);
}
function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) ytCmd('mute', []);
  else { ytCmd('unMute', []); ytCmd('setVolume', [volLevel]); }
  document.getElementById('ico-vol').style.display = isMuted ? 'none' : 'block';
  document.getElementById('ico-mute').style.display = isMuted ? 'block' : 'none';
}

// KEYBOARD SHORTCUTS
document.addEventListener('keydown', function(e) {
  var tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  switch(e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft':
      e.preventDefault(); prevTrack(); break;
    case 'ArrowRight':
      e.preventDefault(); nextTrack(); break;
    case 'm': case 'M':
      toggleMute(); break;
    case 's': case 'S':
      toggleShuffle(); break;
    case 'r': case 'R':
      toggleRepeat(); break;
    case 'q': case 'Q':
      switchTab('queue'); break;
    case 'h': case 'H':
      switchTab('history'); break;
    case 'p': case 'P':
      switchTab('playlist'); break;
  }
});

// SEARCH
function doSearch() {
  var q = document.getElementById('search-input').value.trim();
  if (!q) { toast('Masukkan nama lagu atau artis!'); return; }
  hideSearchDropdown();
  addSearchHistory(q);
  var btn = document.getElementById('btn-search');
  btn.disabled = true; btn.textContent = '...';
  showSearchingState();

  if (!API_KEY) {
    setTimeout(function() {
      btn.disabled = false; btn.textContent = 'Cari';
      showDemoPlaylist(q);
    }, 600);
    return;
  }
  corsProxyIdx = 0;
  trySearchWithProxy(q, btn);
}

function trySearchWithProxy(q, btn) {
  var ytUrl = 'https://www.googleapis.com/youtube/v3/search'
    + '?part=snippet&type=video&videoCategoryId=10&maxResults=20'
    + '&q=' + encodeURIComponent(q + ' music') + '&key=' + API_KEY;
  var fetchUrl = corsProxyIdx === 0 ? ytUrl
    : corsProxyIdx === 1 ? CORS_PROXIES[0] + encodeURIComponent(ytUrl)
    : corsProxyIdx === 2 ? CORS_PROXIES[1] + encodeURIComponent(ytUrl)
    : null;
  if (!fetchUrl) {
    btn.disabled = false; btn.textContent = 'Cari';
    toast('API tidak dapat dijangkau. Mode demo aktif.');
    showDemoPlaylist(q); setModeText('Demo mode — jaringan memblokir API'); return;
  }
  fetch(fetchUrl)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(raw) {
      var data = raw.contents ? JSON.parse(raw.contents) : raw;
      if (data.error) throw new Error(data.error.message || 'API Error');
      if (!data.items || !data.items.length) { toast('Tidak ada hasil.'); renderEmpty('Tidak ada hasil'); btn.disabled = false; btn.textContent = 'Cari'; return; }
      tracks = data.items.map(function(it) {
        return { id: it.id.videoId, title: it.snippet.title, ch: it.snippet.channelTitle, thumb: (it.snippet.thumbnails.default||{}).url||'' };
      });
      renderTracks();
      btn.disabled = false; btn.textContent = 'Cari';
      setModeText('Qoovy Aktif (' + (corsProxyIdx === 0 ? 'Tekan Icon Tambah Untuk Antrean' : 'via proxy') + ')');
      toast('Ditemukan ' + tracks.length + ' lagu');
      if (isShuffle) buildShuffleQueue(curIdx);
    })
    .catch(function() { corsProxyIdx++; trySearchWithProxy(q, btn); });
}

function setModeText(text) {
  document.getElementById('mode-text').textContent = text;
}

function showDemoPlaylist(q) {
  tracks = [
    // { id:'dQw4w9WgXcQ', title:'Rick Astley - Never Gonna Give You Up', ch:'Rick Astley', thumb:'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg' },
    // { id:'kXYiU_JCYtU', title:'Linkin Park - Numb', ch:'Linkin Park', thumb:'https://i.ytimg.com/vi/kXYiU_JCYtU/default.jpg' },
    // { id:'fJ9rUzIMcZQ', title:'Bohemian Rhapsody', ch:'Queen Official', thumb:'https://i.ytimg.com/vi/fJ9rUzIMcZQ/default.jpg' },
    // { id:'1w7OgIMMRc4', title:'Sweet Child O Mine', ch:'Guns N Roses', thumb:'https://i.ytimg.com/vi/1w7OgIMMRc4/default.jpg' },
    // { id:'CdqoNKCCt7A', title:'Someone Like You', ch:'Adele', thumb:'https://i.ytimg.com/vi/CdqoNKCCt7A/default.jpg' },
    // { id:'JGwWNGJdvx8', title:'Shape of You', ch:'Ed Sheeran', thumb:'https://i.ytimg.com/vi/JGwWNGJdvx8/default.jpg' },
    // { id:'OPf0YbXqDm0', title:'Uptown Funk ft Bruno Mars', ch:'Mark Ronson', thumb:'https://i.ytimg.com/vi/OPf0YbXqDm0/default.jpg' },
    // { id:'hLQl3WQQoQ0', title:'Adele - Someone Like You (Official)', ch:'Adele', thumb:'https://i.ytimg.com/vi/hLQl3WQQoQ0/default.jpg' },
    // { id:'YQHsXMglC9A', title:'Adele - Hello', ch:'Adele', thumb:'https://i.ytimg.com/vi/YQHsXMglC9A/default.jpg' },
    // { id:'7wtfhZwyrcc', title:'Post Malone - Circles', ch:'Post Malone', thumb:'https://i.ytimg.com/vi/7wtfhZwyrcc/default.jpg' }
  ];
  renderTracks();
  setModeText('Mode demo — masukkan Code Key');
  toast('Mode demo aktif — ' + tracks.length + ' lagu tersedia');
}

function showSearchingState() {
  document.getElementById('track-list').innerHTML =
    '<div class="empty-wrap">'
    + '<div class="empty-icon-wrap"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
    + '<div class="empty-title">Mencari...</div>'
    + '<div class="spinner-sm"></div>'
    + '</div>';
  switchTab('playlist');
}

function renderEmpty(msg) {
  document.getElementById('track-list').innerHTML = '<div class="empty-wrap"><div class="empty-title">' + esc(msg) + '</div></div>';
  document.getElementById('track-badge').textContent = '0 lagu';
  document.getElementById('badge-playlist').textContent = '0';
}

function renderTracks() {
  var n = tracks.length;
  document.getElementById('track-badge').textContent = n + ' lagu';
  document.getElementById('badge-playlist').textContent = n;
  var html = tracks.map(function(t, i) {
    return '<div class="track-item' + (i === curIdx ? ' active' : '') + '" id="ti-' + i + '" onclick="playTrack(' + i + ')">'
      + '<img class="track-thumb" src="' + esc(t.thumb) + '" alt="" onerror="this.style.background=\'#2a2a3a\'" loading="lazy"/>'
      + '<div class="track-info"><div class="track-title">' + esc(t.title) + '</div><div class="track-ch">' + esc(t.ch) + '</div></div>'
      + '<div class="track-right">'
      + '<div class="track-actions">'
      + '<button class="btn-queue-add" onclick="event.stopPropagation();addToQueue(tracks[' + i + '])" title="Tambah ke antrean">'
      + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '</button>'
      + '</div>'
      + '<div class="track-idx">' + (i+1) + '</div>'
      + '<div class="wave-bars"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>'
      + '</div>'
      + '</div>';
  }).join('');
  document.getElementById('track-list').innerHTML = html;
}

function scrollToTrack(i) {
  var el = document.getElementById('ti-' + i);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// UI HELPERS
function showLdr() { document.getElementById('vid-loading').classList.add('show'); }
function hideLdr() { document.getElementById('vid-loading').classList.remove('show'); }

var toastTmr = null;
function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderLeftColor = (type === 'err') ? 'var(--red)' : (type === 'warn') ? 'var(--yellow)' : 'var(--accent)';
  el.classList.add('show');
  if (toastTmr) clearTimeout(toastTmr);
  toastTmr = setTimeout(function() { el.classList.remove('show'); }, 3200);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// API KEY MODAL
var firstOpen = true;
function openModal(first) {
  firstOpen = !!first;
  document.getElementById('btn-modal-cancel').style.display = first ? 'none' : 'block';
  document.getElementById('api-key-input').value = API_KEY || '';
  document.getElementById('modal-backdrop').classList.add('show');
  setTimeout(function() { document.getElementById('api-key-input').focus(); }, 200);
}
function closeModal() { document.getElementById('modal-backdrop').classList.remove('show'); }
function saveApiKey() {
  var val = document.getElementById('api-key-input').value.trim();
  API_KEY = val; updateApiStatus(); closeModal(); corsProxyIdx = 0;
  if (val) { toast('Code Key tersimpan!'); setModeText('Qoovy Key aktif'); }
  else { toast('Mode demo aktif.'); setModeText('Mode demo — masukkan Code Key untuk pencarian nyata'); }
}
function updateApiStatus() {
  var dot = document.getElementById('status-dot');
  var lbl = document.getElementById('api-btn-label');
  if (API_KEY) { dot.classList.add('active'); lbl.textContent = 'Key: ***' + API_KEY.slice(-4); }
  else { dot.classList.remove('active'); lbl.textContent = 'SET API KEY'; }
}
function toggleKeyVis() {
  var inp = document.getElementById('api-key-input');
  var isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  document.getElementById('eye-open').style.display = isPass ? 'none' : 'block';
  document.getElementById('eye-closed').style.display = isPass ? 'block' : 'none';
}
document.getElementById('modal-backdrop').addEventListener('click', function(e) {
  if (e.target === this && !firstOpen) closeModal();
});
document.getElementById('api-key-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') saveApiKey();
});

// TOUCH: progress bar
document.addEventListener('DOMContentLoaded', function() {
  var pt = document.getElementById('prog-track');
  if (pt) {
    pt.addEventListener('touchstart', function(e) { e.preventDefault(); seekTo(e); }, { passive:false });
    pt.addEventListener('touchmove', function(e) { e.preventDefault(); seekTo(e); }, { passive:false });
  }
  document.getElementById('track-list').addEventListener('click', function() {
    if (window.innerWidth <= 640 && mobilePlaylistOpen) setTimeout(closeMobilePlaylist, 200);
  });
});

// INIT
window.addEventListener('load', function() {
  loadFromStorage();
  showDemoPlaylist('demo');
  renderHistoryList();
  renderQueueList();
  setTimeout(function() { openModal(true); }, 500);
});