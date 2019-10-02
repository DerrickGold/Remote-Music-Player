const isntPlaying = (state) => {
  return (state == PlayBackStates["PAUSED"] ||
    state == PlayBackStates["STOPPED"]);
}

class MediaButtons {

  constructor(evtSys, mediaLibrary) {
    this.mediaLibrary = mediaLibrary;
    this.currentState = null;
    this.evtSys = evtSys;

    const updatePlayPauseBtn = (e) => {
      this.currentState = e.playbackState;
      const playing = !isntPlaying(this.currentState);
      effect('[role="play"]', (el) => {
        el.classList.toggle('on', playing);
      });
    }

    if (window.mobilecheck) react('[role="load-screen"]', 'click', (ev) => {
      const msg = document.querySelector('[role="load-text"]');
      if (this.mediaLibrary.autoplay && !msg.classList.contains("hidden")) {
        msg.classList.add("hidden");
        //take control of the media player in mobile browsers
        this.play(ev);
        this.play(ev);
      }
    });

    react('[role="play"]', 'click', (ev) => {
      this.play(ev);
    });
    react('[role="toggle-player"]', 'click', (ev) => {
      this.nowPlaying(ev);
    });
    react('[role="next"]', 'click', (ev) => {
      this.next(ev);
    });
    react('[role="prev"]', 'click', (ev) => {
      this.prev(ev);
    });
    react('[role="shuffle"]', 'click', (ev) => {
      this.shuffle(ev);
    });
    react('[role="update-library"]', 'click', (ev) => {
      this.updateLibrary(ev);
    });
    react('[role="toggle-fullscreen"]', 'click', (ev) => {
      this.toggleFullscreen(ev);
    });
    this.evtSys.addEventListener('media state change', updatePlayPauseBtn);

    const searchBtn = document.getElementById("search-btn");
    searchBtn.onclick = (e) => {
      e.preventDefault();
      const searchKey = document.getElementById("search-txt").value;
      if (searchKey.length > 0)
        this.mediaLibrary.showSearch(searchKey);
      else
        this.mediaLibrary.clearSearch();
    }

    const clearSearchBtn = document.getElementById("search-btn-clear");
    clearSearchBtn.onclick = (e) => {
      e.preventDefault();
      const searchBox = document.getElementById("search-txt");
      searchBox.value = "";
      this.mediaLibrary.clearSearch();
    }

    const scrubbox = document.getElementById("scrub-box");
    scrubbox.onmousedown = (e) => {
      this.mediaLibrary.scrubStart();
      e.preventDefault();
      e.stopPropagation();
    }

    document.addEventListener("mouseup", (e) => {
      this.mediaLibrary.scrubEnd();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.mediaLibrary.isScrubbing) return;
      e.preventDefault();
      e.stopPropagation();
      this.mediaLibrary.scrub(scrubbox, e);
    });
    scrubbox.onclick = (e) => {
      this.mediaLibrary.scrub(scrubbox, e);
    }
    //add keyboard bindings
    document.addEventListener("keypress", (e) => {
      switch (e.key) {
        case ' ':
          this.play(e);
          break;
        case 'b':
          this.next(e);
          break;
        case 'z':
          this.prev(e);
          break;
        case 's':
          this.shuffle(e);
          break;
        case 'i':
          this.nowPlaying(e);
          break;
        case 'f':
          this.fileLocKey(e);
          break;
        case '/':
          this.searchKey(e);
          break;
        default:
          break;
      }
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.play();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.prev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.next()
      });
      this.evtSys.addEventListener('retrieved metadata', (e) => {
        const metadata = e.detail;
        navigator.mediaSession.metadata = new MediaMetadata({
          'title': metadata.title,
          'artist': metadata.artist,
          'album': metadata.album,
          artwork: [{
            src: metadata.cover
          }]
        });
      });
    }
  }

  play(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    this.mediaLibrary.audioDiv.play();
    if (!this.mediaLibrary.curTrackInfo) {
      const track = this.mediaLibrary.getRandomTrack();
      this.mediaLibrary.playSong(track, 0);
      return;
    }

    if (isntPlaying(this.mediaLibrary.getPlaybackState()))
      this.mediaLibrary.unpauseSong();
    else
      this.mediaLibrary.pauseSong();
  }

  nowPlaying(ev) {
    this.mediaLibrary.toggleNowPlaying(false);
  }

  next(ev) {
    this.mediaLibrary.nextSong();
  }

  prev(ev) {
    this.mediaLibrary.prevSong();
  }

  shuffle(ev) {
    const state = !this.mediaLibrary.shuffle
    this.mediaLibrary.shuffle = state;
    effect('[role="shuffle"]', (el) => {
      el.classList.toggle('active', state);
    });
  }

  searchKey(ev) {
    this.mediaLibrary.toggleNowPlaying(false, true);
    document.getElementById("search-txt").focus();
  }

  fileLocKey(ev) {
    this.mediaLibrary.toggleNowPlaying(false, true);
    this.mediaLibrary.openFileDisplayToTrack();
  }
  updateLibrary(ev) {
    this.mediaLibrary.rescanFiles();
  }

  toggleFullscreen(ev) {
    const t = document.body;
    if (t.requestFullscreen) {
      if (!t.fullscreenElement) t.requestFullscreen();
      else {
        if (t.exitFullscreen) t.exitFullscreen();
      }
    } else if (t.mozRequestFullScreen) {
      if (!t.mozFullScreenElement) t.mozRequestFullScreen();
      else {
        if (t.mozCancelFullScreen) t.mozCancelFullScreen();
      }
    } else if (t.webkitRequestFullscreen) {
      if (!t.webkitFullscreenElement) t.webkitRequestFullscreen();
      else {
        if (t.webkitExitFullscreen) t.webkitExitFullscreen();
      }
    }
  }
}
