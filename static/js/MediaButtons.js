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

  react('[role="play"]', 'click', function (ev) {
    if (!self.mediaLibrary.curTrackInfo) {
      var track = self.mediaLibrary.getRandomTrack();
      self.mediaLibrary.playSong(track, 0);
      return;
    }

    if (isntPlaying(self.mediaLibrary.getPlaybackState()))
      self.mediaLibrary.unpauseSong();
    else 
      self.mediaLibrary.pauseSong();
  });

  /*  
  var speakerBtn = document.getElementById("media-btn-speaker");
  speakerBtn.onclick = function() {
    self.mediaLibrary.swapOutput();
  }
  */

  react('[role="toggle-player"]', 'click', function (ev) {
    ev.stopPropagation();
    self.mediaLibrary.toggleNowPlaying(false);
  });

  react('[role="next"]', 'click', function (ev) {
    self.mediaLibrary.nextSong();
  });

  react('[role="prev"]', 'click', function (ev) {
    self.mediaLibrary.prevSong();
  });

  react('[role="shuffle"]', 'click', function (ev) {
    var state = !self.mediaLibrary.shuffle
    self.mediaLibrary.shuffle = state;
    effect('[role="shuffle"]', function (el) {
      el.classList.toggle('active', state);
    });
  });

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
  this.evtSys.addEventListener('media state change', updatePlayPauseBtn);

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
    case ' ':
      e.preventDefault();
      playPauseBtn.click();
      break;
    case 'b': nextBtn.click(); break;
    case 'z': prevBtn.click(); break;
    case 's': shuffleBtn.click(); break;
    case 'i': nowPlayingBtn.click(); break;
    case 'f': self.mediaLibrary.openFileDisplayToTrack(); break;
    case '/': document.getElementById("search-txt").focus(); break;
    default: break;
    }
  });
}

