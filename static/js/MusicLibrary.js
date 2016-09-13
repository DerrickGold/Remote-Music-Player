PlayBackStates = {
  "STOPPED": -1,
  "PLAYING": 0,
  "PAUSED": 1
}

MusicLibrary = function(evtSys, doStreaming) {
  this.mediaDir = null;
  this.mediaHash = {};
  this.indentSize = 10;
  this.audioDiv = null;
  this.streaming = doStreaming;
  this.playbackState = PlayBackStates["STOPPED"];
  this.evtSys = evtSys;
  this.curTrackInfo = null;
  this.curTimeOffset = 0;
  this.seekTimeTo = 0;
  this.curTrackLen = 0;
  this.isScrubbing = false;
  this.shuffle = false;
  this.playHist = [];
  this.navbarOffset = "";
  this.supportedFormats = null;
  this.curTimeDiv = null;
  this.scrubSlider = null;
  this.init();
}

MusicLibrary.prototype.encodeURI = function(uriIn) {
	return encodeURI(uriIn).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

MusicLibrary.prototype.getFolderCollapseId = function(directoryID) {
  return "collapse-" + directoryID;
}

MusicLibrary.prototype.getRandomTrack = function() {
  var allFiles = Object.keys(this.mediaHash), index = -1;
  while (index < 0 || this.mediaHash[allFiles[index]].directory)
    index = Math.floor((Math.random() * 17435609119)) % allFiles.length;
  return this.mediaHash[allFiles[index]];
}

MusicLibrary.prototype.getRootDirDiv = function() {
  return document.getElementById("dirlist");
}

MusicLibrary.prototype.toggleNowPlaying = function (open) {
  var el = document.querySelector('[role="manager"]')
  var cls = 'inactive'
  if (typeof open == 'undefined') {
    el.classList.toggle(cls)
    return
  }
  el.classList.toggle(cls, open)
}

MusicLibrary.prototype.getFiles = function() {
  var self = this;
  this.evtSys.dispatchEvent("loading");
  this.apiCall("/api/files", "GET", true, function(resp) {
    self.mediaDir = JSON.parse(resp);
    self.makeMediaLibHash(self.mediaDir.files);
    self.displayFolder(self.mediaDir.files, self.getRootDirDiv());
    self.evtSys.dispatchEvent("loading done");
  });
}

MusicLibrary.prototype.getTrackPos = function(doneCb) {
  if (this.streaming) return;
  var self = this;
  this.apiCall("/api/commands/info", "POST", true, function(resp) {
    var data = JSON.parse(resp);
    self.curTimeOffset = data.pos;
    if (doneCb) doneCb(data);
  });
}

MusicLibrary.prototype.getPlaybackState = function() {
  return this.playbackState;
}

MusicLibrary.prototype.toggleFolder = function (container, open) {
  var state = container.querySelector('[role="expand-state"]')
  var body  = container.querySelector('[role="listing"]')
  if (typeof open == 'undefined')
    open = !body.classList.contains('closed')
  else
    open = !open
  body.classList.toggle('closed', open)
  state.classList.toggle('fa-caret-down', !open)
  state.classList.toggle('fa-caret-right', open)
}

MusicLibrary.prototype.setFolderView = function(folderIdDiv, view) {
  var folderNode = folderIdDiv.parentNode;
  this.toggleFolder(folderIdDiv.parentNode, view == "open")
}

MusicLibrary.prototype.makeMediaLibHash = function(root) {
  this.mediaHash[root.id] = root;
  for(var i = 0; i < root.children.length; i++)
    this.makeMediaLibHash(root.children[i]);
}

MusicLibrary.prototype.secondsToMinutesStr = function(time) {
  time = parseInt(time);
  var minutes = Math.floor(time / 60);
  var seconds = time % 60;
  var result = '' + minutes + ":";
  if (seconds < 10) result += "0";
  result += seconds;
  return result
}

MusicLibrary.prototype.apiCall = function(route, method, async, successCb, errorCb) {
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (xhttp.readyState == 4 && xhttp.status == 200) {
      if (successCb) successCb(xhttp.responseText);
    } else if (xhttp.readyState == 4) {
      if (errorCb) errorCb(xhttp.responseText);
    }
  }
  xhttp.open(method, route, async);
  xhttp.send(); 
}

MusicLibrary.prototype.reverseTrackHashLookup = function(startNode) {
  var findStack = [];
  var curNode = startNode;
  while(curNode.parent != ".") {
    findStack.push(curNode.id);
    curNode = this.mediaHash[curNode.parent]
  }
  findStack.push(curNode.id);
  return findStack;
}

MusicLibrary.prototype.displayMakeExcludeButton = function(nodeID, container) {
  var self = this
  var icon = document.createElement("i");
  icon.className = "fa fa-fw fa-check-square-o exclude-btn";
  icon.setAttribute("aria-hidden", "true");
  icon.onclick = function(e) {
    e.preventDefault();
    var aElm = container.getElementsByTagName("a");
    var state = !self.mediaHash[nodeID]._exclude
    self.mediaHash[nodeID]._exclude = state
    icon.classList.toggle('fa-check-square-o', !state)
    icon.classList.toggle('fa-square-o', state)
    container.classList.toggle("disabled", state);
    if (state) self.toggleFolder(container.parentElement, false)
  }
  return icon;
}

MusicLibrary.prototype.displayMakeFolder = function(folderEntry, expanded, depth) {
  // TODO use template...
  var header = document.createElement("p");
  header.id = folderEntry.id;
  header.setAttribute("role", "tab");

  var excludeBtn = this.displayMakeExcludeButton(header);
  header.appendChild(excludeBtn);

  var icon = document.createElement("i");
  icon.className = "fa fa-fw fa-caret-right expand-state";
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("role", "expand-state")
  header.appendChild(icon);

  //create collapse button
  var collapseButton = document.createElement("a");
  collapseButton.classList.add("folder-entry-name");
  collapseButton.innerHTML = folderEntry.name;
  collapseButton.style.pointerEvents = true;
  collapseButton.style.cursor = 'pointer';
  header.appendChild(collapseButton);

  var panel = document.createElement("li");
  panel.classList.add("folder-entry");
  panel.id = folderEntry.id;
  panel.appendChild(header);

  var body = document.createElement("ul");
  body.id = this.getFolderCollapseId(folderEntry.id);
  body.setAttribute('role', 'listing');
  body.className = "directory-listing closed";

  panel.appendChild(body);

  var self = this
  collapseButton.onclick = function (e) {
    self.toggleFolder(panel)
  }

  return [panel, body];
}

MusicLibrary.prototype.displayMakeFile = function(fileEntry, depth) {
  var self = this;
  var file = document.createElement("li");
  file.id = fileEntry.id;
  file.classList.add("file-entry");
  var name = fileEntry.name;
  var text = document.createElement("a");
  text.innerHTML = name.substr(0, name.lastIndexOf('.'));
  text.title = name;
  text.classList.add("file-entry-name");
  text.setAttribute("href", "#");
  file.appendChild(text);
  text.onclick = function(e) {
    e.preventDefault();
    self.playSong(fileEntry, 0);
  }
  return file;
}

MusicLibrary.prototype.displayFolder = function(folder, parentDiv, depth) {
  if (!depth) depth = 0;
  var self = this;
  var frag = document.createDocumentFragment();
  setTimeout(function() {
    folder.children.forEach(function(f) {
      if (f.directory) {
        var things = self.displayMakeFolder(f, false, depth);
        frag.appendChild(things[0]);
        self.displayFolder(f, things[1], depth + 1);
      } else {
        var thing = self.displayMakeFile(f, depth)
        frag.appendChild(thing);
      }
    });
    parentDiv.appendChild(frag);
  }, 1);
}

MusicLibrary.prototype.openFileDisplayToTrack = function(track) {
  if (track === undefined) track = this.curTrackInfo;
  //first check if item is not already in viewport before scrolling
  var trackDiv = document.getElementById(track.id);
  var inView = false;
  if (trackDiv) {
    var trackDivBox = trackDiv.getBoundingClientRect();
    inView = (trackDivBox.top >= 0 && trackDivBox.left >= 0 &&
              trackDivBox.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
              trackDivBox.right <= (window.innerWidth || document.documentElement.clientWidth));
    //check if folder is open too
    var trackFolder = document.getElementById(this.getFolderCollapseId(track.parent));
    if (trackFolder) inView = (inView && trackFolder.classList.contains("in"));
  }
  var nodes = this.reverseTrackHashLookup(track).reverse();
  var lastDiv = null;
  var self = this, lastDiv = null;
  this.chunking(nodes, function(curNode) {
    var id = curNode;
    if (self.mediaHash[id].parent == ".") return;
    if (self.mediaHash[id].directory) {
      lastDiv = document.getElementById(id);
      if (!lastDiv) return;
      self.setFolderView(lastDiv, "open");
    } else
      lastDiv = document.getElementById(id);
  }, function() {
    if (inView || !lastDiv) return;
    lastDiv.scrollIntoView(true);
    window.scrollBy(0, -self.navbarOffset);
  });
}

MusicLibrary.prototype.chunking = function(library, cb, donecb) {
  var perFrame = 500, idx = 0, lib = library, fps = 60;
  function doChunk(data) {
    setTimeout(function() {
      if (idx >= lib.length) {
        if (donecb) donecb();
        return;
      }
      for (var x = 0; x < perFrame; x++) {
        if (idx + x >= lib.length) break;
        var entry = lib[idx + x];
        if (cb) cb(entry);
      }
      idx += perFrame;
      window.requestAnimationFrame(doChunk);
    }, 1000/fps);
  }
  window.requestAnimationFrame(doChunk);
}

MusicLibrary.prototype.showSearch = function(keyword) {
  var self = this;
  var cls  = 'search-hide'
  keyword = keyword.replace(/^s+|\s+$/g, '');
  //keyword = keyword.replace(' ', '%20');
	keyword = self.encodeURI(keyword)
  if (keyword.length <= 0) return;
  this.toggleNowPlaying(false, true);
  this.evtSys.dispatchEvent("loading");
  this.apiCall("/api/files/search/" + keyword, "GET", true, function(resp) {
    var data = JSON.parse(resp);
    //var everything = document.querySelectorAll('[role="audio-file"],[role="directory"]');
    var everything = document.querySelectorAll('.folder-entry,.file-entry');
    self.chunking(everything, function(d) {
      var id = d.getAttribute('id');
      if (id in data) {
        d.classList.toggle(cls, false);
        //if (d.classList.contains("hidden")) d.classList.remove("hidden");
        //if (d.getAttribute('role') === 'directory') return;
        if (d.classList.contains('folder-entry')) return;
        else {
          var nodes = self.reverseTrackHashLookup(self.mediaHash[id]);
          var skipEntry = false;
          var checkExcluded = nodes.slice(0).reverse();
          while (checkExcluded.length > 0) {
            var id = checkExcluded.pop();
            if (self.mediaHash[id]._exclude) {
              skipEntry = true;
              delete data[id];
              break;
            }
          }
          if (skipEntry) return;
          while(nodes.length > 0) {
            var nodeID = nodes.pop();
            if (self.mediaHash[nodeID].parent == ".") continue;
            data[nodeID] = 1;
            var div = document.getElementById(nodeID);
            if (self.mediaHash[nodeID].directory) {
              self.setFolderView(div, "open");
            }
            //div.classList.remove("hidden");
            div.classList.remove(cls);
          }
        }
      //} else if (!d.classList.contains("hidden"))
      } else if (!d.classList.contains(cls))
        //d.classList.add("hidden");
        d.classList.add(cls);
    }, function() {
      self.evtSys.dispatchEvent("loading done");
    });
  }, function(resp) {
    self.evtSys.dispatchEvent("loading done");
  });
}

MusicLibrary.prototype.showFiles = function(show, donecb) {
  var apply = function(el) {
    el.classList.toggle('search-hide', !show)
    //if (show) el.classList.remove("hidden");
    //else el.classList.add("hidden");
  }
  //var x = document.querySelectorAll('[role="audio-file"],[role="directory"]');
  var x = document.querySelectorAll('.file-entry,.folder-entry');
  this.chunking(Array.prototype.slice.call(x), apply, donecb);
}

MusicLibrary.prototype.clearSearch = function(keyword) {
  this.showFiles(true)
}

MusicLibrary.prototype.swapStreamingToServer = function() {
  // round value to one decimal place for mplayer
  var timeoffset = parseFloat(this.curTimeOffset)
  timeoffset = timeoffset.toFixed(1);
  this.pauseSong();
  this.streaming = false;
  this.playSong(this.curTrackInfo, timeoffset);
}

MusicLibrary.prototype.swapServerToStreaming = function() {
  this.pauseSong();
  var self = this;
  this.getTrackPos(function() {
    var timeoffset = parseFloat(self.curTimeOffset);
    timeoffset += 0.1;
    timeoffset = timeoffset.toFixed(1);
    self.streaming = true;
    self.playSong(self.curTrackInfo, timeoffset);
  });
}

MusicLibrary.prototype.swapOutput = function() {
  this.evtSys.dispatchEvent("loading");
  if (this.streaming) this.swapStreamingToServer();
  else this.swapServerToStreaming();
}

MusicLibrary.prototype.stopSong = function() {
  if (!this.streaming) {
    var self = this;
    this.apiCall("/api/commands/stop", "POST", true, function(resp) {
      self.playbackState = PlayBackStates["STOPPED"];
      self.evtSys.dispatchEvent('media state change', self.playbackState);
    });
  } else
    this.audioDiv.pause();
}

MusicLibrary.prototype.playSong = function(songEntry, offset) {
  this.curTrackLen = 0;
  this.seekTimeTo = -1;
  this.evtSys.dispatchEvent("loading");
  if (this.curTrackInfo) {
    this.playHist.push(this.curTrackInfo);
    var lastPlayed = document.getElementById(this.curTrackInfo.id);
    lastPlayed.classList.remove('playing-entry');
  }
  this.curTrackInfo = songEntry;
  var nowplaying = document.getElementById(this.curTrackInfo.id);
  nowplaying.classList.add('playing-entry');
  //this.openFileDisplayToTrack(songEntry);
  var self = this;
  if (!this.streaming) {
    var url = "/api/files/" + songEntry.id + "/play";
    if (offset >= 0) url += "?offset=" + offset;
    this.apiCall(url, "GET", true, function(resp) {
      self.playbackState = PlayBackStates["PLAYING"];
      self.evtSys.dispatchEvent('media state change', self.playbackState);
      self.updateTrackInfo(function(d) {
        self.curTrackLen = d['length'];
      });
      self.evtSys.dispatchEvent("loading done");
    });
  } else {
    //if we are streaming, get audio file path to add to local web player
    this.apiCall("/api/files/" + songEntry.id, "GET", true, function(resp) {
      var trackData = JSON.parse(resp);
      var streamFormat = document.getElementById("stream-format");
      var fmt = streamFormat.options[streamFormat.selectedIndex].value;
      var streamOptions = document.getElementById("stream-quality");
      var quality = streamOptions.options[streamOptions.selectedIndex].value;
      var transcodeOptions = document.getElementById("transcoding-option");
      var transcode = transcodeOptions.options[transcodeOptions.selectedIndex].value;
			var srcURL = "api/files/" + trackData.id + "/stream?format=" + fmt +
					"&quality=" + quality + "&transcode=" + transcode;
      self.audioDiv.src = self.encodeURI(srcURL);
      self.audioDiv.play();
      var seekHandler = function(audio) {
        self.audioDiv.removeEventListener('canplay', seekHandler);
        if (offset > 0) audio.target.currentTime = offset;
        self.evtSys.dispatchEvent("loading done");
      }
      self.audioDiv.addEventListener("canplay",seekHandler);
      self.playbackState = PlayBackStates["PLAYING"];
      self.evtSys.dispatchEvent('media state change', self.playbackState);
      self.updateTrackInfo(function(d) {
        self.curTrackLen = d['length'];
      });
    });
  }
}

MusicLibrary.prototype.pauseSong = function() {
  if (!this.streaming) {
    var self = this;
    this.apiCall("/api/commands/pause", "POST", true, function(resp) {
      self.playbackState = PlayBackStates["PAUSED"];
      self.evtSys.dispatchEvent('media state change', self.playbackState);
    });
  } else {
    this.audioDiv.pause();
    this.playbackState = PlayBackStates["PAUSED"];
    this.evtSys.dispatchEvent('media state change', this.playbackState);
  }
}

MusicLibrary.prototype.unpauseSong = function() {
  if (!this.streaming) {
    var self = this;
    this.apiCall("/api/commands/pause", "POST", true, function(resp) {
      self.playbackState = PlayBackStates["PLAYING"];
      self.evtSys.dispatchEvent('media state change', self.playbackState);
    });
  }
  else {
    this.audioDiv.play();
    this.playbackState = PlayBackStates["PLAYING"];
    this.evtSys.dispatchEvent('media state change', this.playbackState);
  }
}

MusicLibrary.prototype.nextSong = function() {
  if (this.shuffle) {
    this.playSong(this.getRandomTrack(), 0);
    return;
  }
  var nodes = this.reverseTrackHashLookup(this.curTrackInfo).reverse();
  var lastDir = this.curTrackInfo.id;
  while (nodes.length > 0) {
    var popped = nodes.pop();
    var directory = this.mediaHash[popped];
    //if we popped off the current track, ignore it for now
    if (!directory.directory) continue;
    //look for the last directory or file visited to get position in directory
    //to coninue from
    var found = false;
    var position = 0;
    for(; position < directory.children.length; position++) {
      if (directory.children[position].id == lastDir) {
        found = true;
        break;
      }
    }
    if (found) position++;
    else position = 0;
    while (position < directory.children.length && directory.children[position]._exclude)
      position++;

    //if we hit the end of the folder, continue up the next level
    if (position >= directory.children.length) {
      lastDir = directory.id;
      continue;
    }
    var nextTrack = directory.children[position];
    while (nextTrack.directory) nextTrack = nextTrack.children[0];
    //otherwise, play the next song
    this.playSong(nextTrack, 0);
    break;
  }
}

MusicLibrary.prototype.prevSong = function() {
  if (this.playHist.length < 1) return;
  this.curTrackInfo = null;
  var lastTrack = this.playHist.pop();
  this.playSong(lastTrack, 0);
}

MusicLibrary.prototype.setCover = function(imgPath, cached) {
  var favicon = document.querySelector('link[rel="icon"]');
  var covers  = document.querySelectorAll('[role="background-cover-art"]');
  if (!cached) imgPath += "?" + Math.floor(Math.random() * 10000000) + 1;
  favicon.href = path
  for (var i = 0; i < covers.length; i++) {
    covers[i].style.backgroundImage = 'url("' + imgPath + '")';
  }
  /*
  var cover = document.querySelector('[role="album-art"]');
  if (imgPath !== undefined) {
		imgPath = self.encodeURI(imgPath);
		cover.setAttribute("src", imgPath +  "?" + Math.floor(Math.random() * 10000000) + 1);
	}
  else cover.setAttribute("src", "static/img/default_album_art.png");*/
}

MusicLibrary.prototype.updateTrackInfo = function(doneCb) {
  var self = this;
  var folderParent = this.mediaHash[this.curTrackInfo.parent];
  
  this.apiCall("/api/files/"+ this.curTrackInfo.id + "/data", "GET", true, function(resp) {
    var data = JSON.parse(resp);
    var str  = '' 
    
    if (!data.title.length) data.title = self.curTrackInfo.name;
    if (data.artist) str += data.artist
    if (str && data.album) str += ' &mdash; ' + data.album
    if (!str && data.album) str += data.album
    
    document.getElementById("curinfo-track").innerHTML = data.title;
    document.getElementById("curinfo-details").innerHTML = str;
    document.title = data.title;
    
    var len = self.secondsToMinutesStr(data["length"]);
    document.getElementById("curinfo-totaltime").innerHTML = len;
    if (typeof doneCb == 'function') doneCb(data);
  });

  if ('covers' in folderParent) {
    var useCover = null;
    folderParent['covers'].forEach(function(c) {
      var str = c.toLowerCase();
      if (str.includes("front") || str.includes("cover") || str.includes("folder")) useCover = c;
    });
    if (!useCover) useCover = folderParent['covers'][0];
    self.setCover([folderParent.path, folderParent.name, useCover].join('/'));
    return
  } 
  
  this.apiCall("/api/files/"+ this.curTrackInfo.id + "/cover", "GET", true, function(resp) {
    var data = JSON.parse(resp);
    self.setCover(!data.code ? data.path : '/static/img/default.jpg', true);
  }, function() {
    //error making cover request
    self.setCover('/static/img/default.jpg', true);
  });
}

MusicLibrary.prototype.updateQualitySelect = function(val) {
  var qualityList = document.getElementById('stream-quality');
  while (qualityList.firstChild)
    qualityList.removeChild(qualityList.firstChild);
  var frag = document.createDocumentFragment()
  this.supportedFormats.quality[val].forEach(function(q) {
    var option = document.createElement("option");
    option.value = q;
    option.text = q;
    if (q == '192k') option.selected = true
    frag.appendChild(option)
  });
  qualityList.appendChild(frag);
}

MusicLibrary.prototype.mouseDivOffset = function(el, mouseevent) {
  var style = window.getComputedStyle(el),
      width = style.getPropertyValue('width'),
      height = style.getPropertyValue('height'),
      box = el.getBoundingClientRect(),
      scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop,
      scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft,
      clientTop = document.documentElement.clientTop || document.body.clientTop || 0,
      clientLeft = document.documentElement.clientLeft || document.body.clientLeft || 0,
      divYLoc = box.top + scrollTop - clientTop,
      divXLoc = box.left + scrollLeft - clientLeft;
  return [mouseevent.clientX - divXLoc, width, mouseevent.clientY - divYLoc, height];
}

MusicLibrary.prototype.scrubStart = function() {
  this.isScrubbing = true;
}

MusicLibrary.prototype.scrubEnd = function() {
  this.isScrubbing = false;
}

MusicLibrary.prototype.scrub = function(scrubbox, mouseevent) {
  var offsets = this.mouseDivOffset(scrubbox, mouseevent);
  if (offsets[0] < 0) return;
  var xoffset = parseFloat((parseInt(offsets[0]) * 100)/parseInt(offsets[1])).toFixed(0);
  this.scrubSlider.style.left = xoffset + "%";
  this.seekTimeTo = (parseInt(offsets[0]))/parseInt(offsets[1]) * this.curTrackLen;
  this.curTimeDiv.innerHTML = this.secondsToMinutesStr(this.seekTimeTo);
}

MusicLibrary.prototype.init = function() {
  var self = this;
  this.getFiles();

  this.audioDiv = document.createElement("AUDIO");
  this.audioDiv.setAttribute("preload", "auto");
  this.curTimeDiv = document.getElementById("curinfo-time");
  this.scrubSlider = document.getElementById("scrubber");  
  this.audioDiv.ontimeupdate = function(e) {
    if (!self.isScrubbing) {
      if (self.curTrackLen > 0) self.scrubSlider.style.left = (self.curTimeOffset * 100 / self.curTrackLen) + '%';
      else self.scrubSlider.style.left = 0;
      if (self.seekTimeTo >= 0) {
        this.currentTime = self.seekTimeTo;
        self.seekTimeTo = -1;
      }
      self.curTimeDiv.innerHTML = self.secondsToMinutesStr(this.currentTime);
    }    
    self.curTimeOffset = this.currentTime;
  }
  this.audioDiv.onended = function() {
    if (self.streaming && self.audioDiv.src.length > 0) self.nextSong();
  }
  this.audioDiv.onseeking = function() { self.evtSys.dispatchEvent("loading"); }
  this.audioDiv.onseeked = function() { self.evtSys.dispatchEvent("loading done"); }
  document.body.appendChild(this.audioDiv);
  
  var style = window.getComputedStyle(document.body);
  this.navbarOffset = parseInt(style.getPropertyValue("padding-top").replace('px', ''));
  /*var curInfo = document.getElementById("openfile-loc-btn");
  curInfo.addEventListener("click", function(e) {
    e.preventDefault();
    self.openFileDisplayToTrack(self.curTrackInfo);
    self.toggleNowPlaying(false, true);
  });*/

  this.evtSys.registerEvent('media state change');

  this.apiCall('/api/commands/formats', 'GET', true, function(resp) {
    self.supportedFormats = JSON.parse(resp);
    var formats = document.getElementById('stream-format');
    self.supportedFormats["format"].forEach(function(fmt) {
      var option = document.createElement("option");
      option.value = fmt;
      option.text = fmt;
      formats.appendChild(option);
    });
    formats.selectedIndex = 0;
    self.updateQualitySelect(self.supportedFormats["format"][0]);
    formats.onchange = function(e) {
      self.updateQualitySelect(e.target.value);
    }
  });
  
  // TODO re-implement
  /*document.querySelector('[role="album-art"]').onclick = function() {
    document.getElementById("curinfo-path").classList.toggle("hidden");
  }*/

  var nowPlaying = document.querySelector('[role="now-playing"]');
  nowPlaying.addEventListener("mousewheel", function(e) { 
    e.preventDefault(); 
    e.stopPropagation(); 
  }, false);
  nowPlaying.addEventListener("DOMMouseScroll", function(e) { 
    e.preventDefault(); 
    e.stopPropagation(); 
  }, false);
  document.getElementById("search-txt").addEventListener("keypress", function(e) { 
    e.stopPropagation(); 
  });

  var open = document.querySelector('[role="open-settings"]')
  open.onclick = function (e) {
    var el = document.querySelector('[role="settings"]')
    el.classList.toggle('open')
  }
}

