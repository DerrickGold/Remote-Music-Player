function isntPlaying (state) {
  return (state == PlayBackStates["PAUSED"] ||
          state == PlayBackStates["STOPPED"]);
}

MediaButtons = function(evtSys, mediaLibrary) {
  var self = this;
  this.mediaLibrary = mediaLibrary;
  this.currentState = null;
  this.evtSys = evtSys;

  var updatePlayPauseBtn = function(e) {
    self.currentState = e.playbackState;
    var playing = !isntPlaying(self.currentState);
    effect('[role="play"]', function (el) {
      el.classList.toggle('on', playing);
    });
  }

  if (window.mobilecheck) react('[role="load-screen"]', 'click', function(ev) {
    var msg = document.querySelector('[role="load-text"]');
    if (self.mediaLibrary.autoplay && !msg.classList.contains("hidden")) {
      msg.classList.add("hidden");
      //take control of the media player in mobile browsers
      self.play(ev);
      self.play(ev);
    }
  });
  react('[role="play"]', 'click', function(ev) { self.play(ev); });
  react('[role="toggle-player"]', 'click', function (ev) { self.nowPlaying(ev); });
  react('[role="next"]', 'click', function (ev) { self.next(ev); });
  react('[role="prev"]', 'click', function (ev) { self.prev(ev); });
  react('[role="shuffle"]', 'click', function (ev) { self.shuffle(ev); });
  react('[role="update-library"]', 'click', function (ev) { self.updateLibrary(ev); }); 
  this.evtSys.addEventListener('media state change', updatePlayPauseBtn);
  /*  
  var speakerBtn = document.getElementById("media-btn-speaker");
  speakerBtn.onclick = function() {
    self.mediaLibrary.swapOutput();
  }
  */
  var searchBtn = document.getElementById("search-btn");
  searchBtn.onclick = function(e) {
    e.preventDefault();
    var searchKey = document.getElementById("search-txt").value;
    if (searchKey.length > 0)
      self.mediaLibrary.showSearch(searchKey);
    else
      self.mediaLibrary.clearSearch();
  }

  var clearSearchBtn = document.getElementById("search-btn-clear");
  clearSearchBtn.onclick = function(e) {
    e.preventDefault();
    var searchBox = document.getElementById("search-txt");
    searchBox.value = "";
    self.mediaLibrary.clearSearch();
  }

  var scrubbox = document.getElementById("scrub-box");
  scrubbox.onmousedown = function(e) {
    //self.isScrubbing = true;
    self.mediaLibrary.scrubStart();
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener("mouseup", function(e) {
    self.mediaLibrary.scrubEnd();
  });
  document.addEventListener("mousemove", function(e) {           
    if (!self.mediaLibrary.isScrubbing) return;
    e.preventDefault();
    e.stopPropagation();
    self.mediaLibrary.scrub(scrubbox, e);
  });
  scrubbox.onclick = function(e) { self.mediaLibrary.scrub(scrubbox, e); }
  //add keyboard bindings
  document.addEventListener("keypress", function(e) {
    switch (e.key) {
    case ' ': self.play(e); break;
    case 'b': self.next(e); break;
    case 'z': self.prev(e); break;
    case 's': self.shuffle(e); break;
    case 'i': self.nowPlaying(e); break;
    case 'f': self.fileLocKey(e); break;
    case '/': self.searchKey(e); break;
    default: break;
    }
  });
}

MediaButtons.prototype.play = function(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  this.mediaLibrary.audioDiv.play();
  if (!this.mediaLibrary.curTrackInfo) {
    var track = this.mediaLibrary.getRandomTrack();
    this.mediaLibrary.playSong(track, 0);
    return;
  }
  
  if (isntPlaying(this.mediaLibrary.getPlaybackState()))
    this.mediaLibrary.unpauseSong();
  else 
    this.mediaLibrary.pauseSong();
}

MediaButtons.prototype.nowPlaying = function(ev) {
  this.mediaLibrary.toggleNowPlaying(false);
}

MediaButtons.prototype.next = function(ev) {
  this.mediaLibrary.nextSong();
}

MediaButtons.prototype.prev = function(ev) {
  this.mediaLibrary.prevSong();
}

MediaButtons.prototype.shuffle = function(ev) {
  var state = !this.mediaLibrary.shuffle
  this.mediaLibrary.shuffle = state;
  effect('[role="shuffle"]', function (el) {
    el.classList.toggle('active', state);
  });
}

MediaButtons.prototype.searchKey = function(ev) {
  this.mediaLibrary.toggleNowPlaying(false, true);
  document.getElementById("search-txt").focus();
}

MediaButtons.prototype.fileLocKey = function(ev) {
  this.mediaLibrary.toggleNowPlaying(false, true);
  this.mediaLibrary.openFileDisplayToTrack();
}

MediaButtons.prototype.updateLibrary = function(ev) {
  this.mediaLibrary.rescanFiles();
}
