var mediaSessionSupported = ('mediaSession' in navigator);

// Artwork fallback bertingkat: thumbnail track → YouTube hqdefault → placeholder SVG
function buildArtwork(track) {
  if (!track) return [];
  var videoId = track.id || '';
  var thumbUrl = track.thumb || '';

  // Gunakan thumbnail resolusi tinggi dari YouTube jika bisa
  var hq   = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
  var mq   = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
  var def  = thumbUrl || ('https://i.ytimg.com/vi/' + videoId + '/default.jpg');

  return [
    { src: hq,  sizes: '480x360', type: 'image/jpeg' },
    { src: mq,  sizes: '320x180', type: 'image/jpeg' },
    { src: def, sizes: '120x90',  type: 'image/jpeg' }
  ];
}

// Update metadata di notifikasi & lock screen
function updateMediaSession(track) {
  if (!mediaSessionSupported || !track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:  track.title || 'Unknown Title',
    artist: track.ch    || 'Unknown Artist',
    album:  'Qoovy Streaming',
    artwork: buildArtwork(track)
  });

  // Update posisi playback agar seek bar di notifikasi akurat
  updateMediaSessionPositionState();
}

// Update posisi & durasi di widget notifikasi
function updateMediaSessionPositionState() {
  if (!mediaSessionSupported) return;
  if (!navigator.mediaSession.setPositionState) return;

  var duration = simDur > 0 ? simDur : 0;
  var position = Math.min(simCur, duration);

  try {
    if (duration > 0) {
      navigator.mediaSession.setPositionState({
        duration:     duration,
        playbackRate: 1.0,
        position:     position
      });
    }
  } catch (e) { /* browser lama mungkin tidak support */ }
}

// Set status playback (playing / paused)
function updateMediaSessionPlaybackState(playing) {
  if (!mediaSessionSupported) return;
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

// Daftarkan semua action handler ke Media Session
function setupMediaSessionHandlers() {
  if (!mediaSessionSupported) return;

  // Play
  navigator.mediaSession.setActionHandler('play', function() {
    if (curIdx < 0 && tracks.length > 0) {
      playTrack(0);
    } else {
      ytCmd('playVideo', []);
      setPlayState(true);
      startProgTimer();
      updateMediaSessionPlaybackState(true);
    }
  });

  // Pause
  navigator.mediaSession.setActionHandler('pause', function() {
    ytCmd('pauseVideo', []);
    setPlayState(false);
    stopProgTimer();
    updateMediaSessionPlaybackState(false);
  });

  // Next track
  navigator.mediaSession.setActionHandler('nexttrack', function() {
    nextTrack();
  });

  // Previous track
  navigator.mediaSession.setActionHandler('previoustrack', function() {
    prevTrack();
  });

  // Seek to (drag seek bar di notifikasi)
  try {
    navigator.mediaSession.setActionHandler('seekto', function(details) {
      if (details.seekTime !== undefined) {
        var seekSec = details.seekTime;
        simCur = seekSec;
        ytCmd('seekTo', [seekSec, true]);
        updateProgressUI();
        updateMediaSessionPositionState();
      }
    });
  } catch(e) { /* tidak semua browser support seekto */ }

  // Seek backward (tombol -10 detik di beberapa browser)
  try {
    navigator.mediaSession.setActionHandler('seekbackward', function(details) {
      var skipSec = (details && details.seekOffset) ? details.seekOffset : 10;
      var newPos  = Math.max(0, simCur - skipSec);
      simCur = newPos;
      ytCmd('seekTo', [newPos, true]);
      updateProgressUI();
      updateMediaSessionPositionState();
    });
  } catch(e) {}

  // Seek forward (tombol +10 detik di beberapa browser)
  try {
    navigator.mediaSession.setActionHandler('seekforward', function(details) {
      var skipSec = (details && details.seekOffset) ? details.seekOffset : 10;
      var newPos  = Math.min(simDur || 99999, simCur + skipSec);
      simCur = newPos;
      ytCmd('seekTo', [newPos, true]);
      updateProgressUI();
      updateMediaSessionPositionState();
    });
  } catch(e) {}

  // Stop
  try {
    navigator.mediaSession.setActionHandler('stop', function() {
      ytCmd('pauseVideo', []);
      setPlayState(false);
      stopProgTimer();
      updateMediaSessionPlaybackState(false);
    });
  } catch(e) {}
}

// Inisialisasi Media Session saat halaman siap
function initMediaSession() {
  if (!mediaSessionSupported) return;
  setupMediaSessionHandlers();
}
