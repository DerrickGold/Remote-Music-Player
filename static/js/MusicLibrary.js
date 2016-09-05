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
  this.shuffle = false;
  this.playHist = [];
  this.navbarOffset = "";
  this.supportedFormats = null;
  this.init();
}

MusicLibrary.prototype.getFolderCollapseId = function(directoryID) {
  return "collapse-" + directoryID;
}

MusicLibrary.prototype.getRandomTrack = function(directory) {
  if (!directory)
    directory = this.mediaDir.files;

  var index = Math.floor(Math.random() * (directory.children.length));
  var file = directory.children[index];

  if (file._exclude)
    return this.getRandomTrack(directory);
  else if (file.directory)
    return this.getRandomTrack(file);

  return file;
}    

MusicLibrary.prototype.getRootDirDiv = function() {
  return document.getElementById("dirlist");
}

MusicLibrary.prototype.showSection = function (name) {
  var content = document.querySelector('content')
  content.className = name
}

MusicLibrary.prototype.toggleNowPlaying = function (open) {
  var content = document.querySelector('content')
  if (typeof open == 'undefined') {
    open = !content.classList.contains('playing')
  }
  this.showSection(open == true ? 'playing' : 'listing')  
}

MusicLibrary.prototype.getFiles = function() {
  var thisClass = this;
  this.evtSys.dispatchEvent("loading");
  this.apiCall("/api/files", "GET", true, function(resp) {
    thisClass.mediaDir = JSON.parse(resp);
    thisClass.makeMediaLibHash(thisClass.mediaDir.files);
    thisClass.displayFolder(thisClass.mediaDir.files, thisClass.getRootDirDiv());
    thisClass.evtSys.dispatchEvent("loading done");
  });
}

MusicLibrary.prototype.getTrackPos = function(doneCb) {
  //don't need to query the server if we are streaming
  if (this.streaming) return;
  var thisClass = this;
  this.apiCall("/api/commands/info", "POST", true, function(resp) {
    var data = JSON.parse(resp);
    thisClass.curTimeOffset = data.pos;
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

MusicLibrary.prototype.displayMakeExcludeButton = function(container) {
  var self = this
  var icon = document.createElement("span");
  icon.className = "fa fa-fw fa-check-square-o exclude-btn";
  icon.setAttribute("aria-hidden", "true");
  icon.onclick = function(e) {
    e.preventDefault();
    var nodeID = container.getAttribute('id');
    var state = !self.mediaHash[nodeID]._exclude
    self.mediaHash[nodeID]._exclude = state
    icon.classList.toggle('fa-check-square-o', !state)
    icon.classList.toggle('fa-square-o', state)
    if (state) {
      container.style.textDecoration = "line-through";
      var aElm = container.getElementsByTagName("a");
      aElm[0].style.pointerEvents = "none";
      self.toggleFolder(container.parentElement, false)
    } else {
      container.style.textDecoration = "";
      var aElm = container.getElementsByTagName("a");
      aElm[0].style.pointerEvents = "";
    }
  }
  return icon;
}

MusicLibrary.prototype.displayMakeFolder = function(folderEntry, expanded, depth) {
  // TODO use template...
  var panelHeader = document.createElement("div");
  panelHeader.setAttribute("id", folderEntry.id);
  panelHeader.classList.add("panel-heading");
  panelHeader.setAttribute("role", "tab");

  var excludeBtn = this.displayMakeExcludeButton(panelHeader);
  panelHeader.appendChild(excludeBtn);

  var icon = document.createElement("span");
  icon.className = "fa fa-fw fa-caret-right expand-state";
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("role", "expand-state")
  panelHeader.appendChild(icon);

  //create collapse button
  var collapseButton = document.createElement("a");
  collapseButton.classList.add("folder-entry-name");
  collapseButton.innerHTML = folderEntry.name;
  collapseButton.style.pointerEvents = true;
  collapseButton.style.cursor = 'pointer';
  panelHeader.appendChild(collapseButton);

  var panel = document.createElement("li");
  panel.appendChild(panelHeader);
  panel.classList.add("panel", "folder-entry", "panel-default");

  var bodyCollapse = document.createElement("div");
  bodyCollapse.setAttribute("id", this.getFolderCollapseId(folderEntry.id));
  bodyCollapse.className = "panel-collapse collapse";
  bodyCollapse.setAttribute("role", "tabpanel");

  var panelBody = document.createElement("ul");
  panelBody.setAttribute('role', 'listing');
  panelBody.className = "directory-listing closed";

  bodyCollapse.appendChild(panelBody);
  panel.appendChild(bodyCollapse);

  var self = this
  collapseButton.onclick = function (e) {
    self.toggleFolder(panel)
  }

  return [panel, panelBody];
}

MusicLibrary.prototype.displayMakeFile = function(fileEntry, depth) {
  var self = this;
  var file = document.createElement("li");
  file.setAttribute("id", fileEntry.id);

  var text = document.createElement("a");
  text.innerHTML = fileEntry.name;
  text.classList.add("file-entry-name");
  text.setAttribute("href", "#");

  file.appendChild(text);
  file.classList.add("file-entry", "panel-heading");

  text.onclick = function(e) {
    e.preventDefault();
    if (self.streaming) {
      self.fakePlay()
    }
    self.playSong(fileEntry, 0);
  }

  return file;
}

MusicLibrary.prototype.displayFolder = function(folder, parentDiv, depth) {
  var thisClass = this;
  if (!depth) depth = 0;
  folder.children.sort(function (a, b) {  
    if (a.directory && !b.directory) return -1
    if (!a.directory && b.directory) return 1
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0    
  })
  folder.children.forEach(function(f) {
    if (f.directory) {
      var things = thisClass.displayMakeFolder(f, false, depth);
      parentDiv.appendChild(things[0]);
      thisClass.displayFolder(f, things[1], depth + 1);
    } else {
      var thing = thisClass.displayMakeFile(f, depth)
      parentDiv.appendChild(thing);
    }
  });
}

MusicLibrary.prototype.openFileDisplayToTrack = function(track) {

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
  if (trackFolder)
      inView = (inView && trackFolder.classList.contains("in"));
    }

    var nodes = this.reverseTrackHashLookup(track);
    var lastDiv = null;

    while(nodes.length > 0) {
  var id = nodes.pop();

  //skip root dir
  if (this.mediaHash[id].parent == ".")
      continue;

  if (this.mediaHash[id].directory) {
      lastDiv = document.getElementById(id);
      if (!lastDiv)
    continue;
      
      this.setFolderView(lastDiv, "open");
  } else 
      lastDiv = document.getElementById(id);
    }

    var thisClass = this;
    (function(oldDiv, isInView) {
  if (!isInView) {
      setTimeout(function() {
    console.log("SCROLLING");
    oldDiv.scrollIntoView(true);
    window.scrollBy(0, -thisClass.navbarOffset);
      }, 500);
  }
    }(lastDiv, inView));
    
    lastDiv.classList.add('playing-entry');
    this.toggleNowPlaying(true);
}

MusicLibrary.prototype.showSearch = function(keyword) {

    var thisClass = this;
    keyword = keyword.replace(/^s+|\s+$/g, '');
    keyword = keyword.replace(' ', '%20');
    if (keyword.length <= 0)
  return;

    this.toggleNowPlaying(false);
    this.evtSys.dispatchEvent("loading");
    
    this.apiCall("/api/files/search/" + keyword, "GET", true, function(resp) {
  var data = JSON.parse(resp);
  
  //make everything hidden, then only show search results
  var x = document.getElementsByClassName("file-entry");
  for (var i = 0; i < x.length; i++)
      x[i].style.display = "none";
  
  x = document.getElementsByClassName("folder-entry");
  for (var i = 0; i < x.length; i++)
      x[i].style.display = "none";
  
  
  var perChunk = 5;
  var numChunks = parseInt(Math.ceil(data.results.length/perChunk));
  for (var cchunk = 0; cchunk < numChunks; cchunk++) {
      
      setTimeout(function(curChunk, numPerChunk) {
    for (var i = 0; i < numPerChunk; i++) {
        
        var index = i + (curChunk * numPerChunk);
        if (index >= data.results.length)
      return;
        
        var d = data.results[index];
        var nodes = thisClass.reverseTrackHashLookup(thisClass.mediaHash[d]);
        
        //make sure we aren't displaying excluded results
        var skipEntry = false;
        var checkExcluded = nodes.slice(0).reverse();
        while (checkExcluded.length > 0) {
      var id = checkExcluded.pop();
      if (thisClass.mediaHash[id]._exclude) {
          skipEntry = true;
          data.results.splice(index, 1);
          i--;
          break;
      }
        }
        
        if (skipEntry)
      continue;
        
        var song = document.getElementById(d);
        song.style.display = "block";
        
        while(nodes.length > 0) {
      var nodeID = nodes.pop();
      if (thisClass.mediaHash[nodeID].parent == ".")
          continue;
      
      var div = document.getElementById(nodeID);
      if (thisClass.mediaHash[nodeID].directory) {
          thisClass.setFolderView(div, "open");
          div.parentNode.style.display = "block";
      } else
          div.style.display = "block";
        }
    }
      }, 10, cchunk, perChunk);
  }
  
  var intervalID = null;
  intervalID = setInterval(function(dataset) {
      if (document.querySelectorAll('.file-entry[style="display: block;"]').length >=
    dataset.length)
      {
    thisClass.evtSys.dispatchEvent("loading done");
    clearInterval(intervalID);
      }
  }, 1000, data.results);
  
  
  
    }, function(resp) {
  thisClass.evtSys.dispatchEvent("loading done");
    }); 
}

MusicLibrary.prototype.clearSearch = function(keyword) {
    var x = document.getElementsByClassName("file-entry");
    for (var i = 0; i < x.length; i++)
  x[i].style.display="";
    
    x = document.getElementsByClassName("folder-entry");
    for (var i = 0; i < x.length; i++)
  x[i].style.display ="";
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
  var self = this;
  this.pauseSong();
  this.getTrackPos(function() {
    var timeoffset = parseFloat(self.curTimeOffset);
    timeoffset += 0.1;
    timeoffset = timeoffset.toFixed(1);
    self.streaming = true;
    self.fakePlay()
    self.playSong(self.curTrackInfo, timeoffset);
  });
}

/*
 * Method included for playing on mobile.
 */
MusicLibrary.prototype.fakePlay = function () {
  this.audioDiv.src = '';
  var promise = this.audioDiv.play(); 
  if (promise) promise.catch(function (err){ console.log(err) })
}
    
MusicLibrary.prototype.swapOutput = function() {
  this.evtSys.dispatchEvent("loading");
  if (this.streaming) return this.swapStreamingToServer();
  this.swapServerToStreaming();
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
    
    this.evtSys.dispatchEvent("loading");
    if (this.curTrackInfo) {
  this.playHist.push(this.curTrackInfo);
  var lastPlayed = document.getElementById(this.curTrackInfo.id);
      lastPlayed.classList.remove('playing-entry');
    }
    
    this.curTrackInfo = songEntry;
    this.openFileDisplayToTrack(songEntry);

    var thisClass = this;
    if (!this.streaming) {
  //not streaming, tell server to play file
  var url = "/api/files/" + songEntry.id + "/play";
  if (offset >= 0)
      url += "?offset=" + offset;
  
  this.apiCall(url, "GET", true, function(resp) {
      thisClass.playbackState = PlayBackStates["PLAYING"];
      thisClass.evtSys.dispatchEvent('media state change', thisClass.playbackState);
      thisClass.updateTrackInfo();
      thisClass.evtSys.dispatchEvent("loading done");
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

      var srcURL = trackData.path + "/" + trackData.name + "?format="+ fmt +
    "&quality=" + quality + "&transcode=" + transcode;
      
      thisClass.audioDiv.src = encodeURI(srcURL);
      thisClass.audioDiv.play();
      
      var seekHandler = function(audio) {
    thisClass.audioDiv.removeEventListener('canplay', seekHandler);
    if (offset > 0)
        audio.target.currentTime = offset;
    
    thisClass.evtSys.dispatchEvent("loading done");       
      }
      thisClass.audioDiv.addEventListener("canplay",seekHandler);
      
      thisClass.playbackState = PlayBackStates["PLAYING"];
      thisClass.evtSys.dispatchEvent('media state change', thisClass.playbackState);
      thisClass.updateTrackInfo();
  });
    }
}

MusicLibrary.prototype.pauseSong = function() {
    if (!this.streaming) {
  var thisClass = this;
  this.apiCall("/api/commands/pause", "POST", true, function(resp) {
      thisClass.playbackState = PlayBackStates["PAUSED"];
      thisClass.evtSys.dispatchEvent('media state change', thisClass.playbackState);
  });
    } else {
  this.audioDiv.pause();
  this.playbackState = PlayBackStates["PAUSED"];
  this.evtSys.dispatchEvent('media state change', this.playbackState);
    }
}

MusicLibrary.prototype.unpauseSong = function() {
    if (!this.streaming) {
  //server operates using a toggle
  var thisClass = this;
  this.apiCall("/api/commands/pause", "POST", true, function(resp) {
      thisClass.playbackState = PlayBackStates["PLAYING"];
      thisClass.evtSys.dispatchEvent('media state change', thisClass.playbackState);
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
  var track = this.getRandomTrack();
  this.playSong(track, 0);
  return;
    } else {
  var nodes = this.reverseTrackHashLookup(this.curTrackInfo).reverse();
  var lastDir = this.curTrackInfo.id;
  
  while (nodes.length > 0) {
      var popped = nodes.pop();
      var directory = this.mediaHash[popped];
      
      //if we popped off the current track, ignore it for now
      if (!directory.directory)
    continue;
      
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
      if (found)
    position++;
      else
    position = 0;
      
      while (position < directory.children.length && directory.children[position]._exclude) {
    position++;
      }
      
      //if we hit the end of the folder, continue up the next level
      if (position >= directory.children.length) {
    lastDir = directory.id;
    continue;
      }
      
      var nextTrack = directory.children[position];
      while (nextTrack.directory)
    nextTrack = nextTrack.children[0];
      
      //otherwise, play the next song
      this.playSong(nextTrack, 0);
      return;
  }
    }
}

MusicLibrary.prototype.prevSong = function() {
  if (this.playHist.length < 1) return;
  this.curTrackInfo = null;
  var lastTrack = this.playHist.pop();
  this.playSong(lastTrack, 0);
}

MusicLibrary.prototype.updateTrackInfo = function(doneCb) {
  var self = this;
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

  this.apiCall("/api/files/"+ this.curTrackInfo.id + "/cover", "GET", true, function(resp) {
    var data    = JSON.parse(resp);
    var favicon = document.querySelector('link[rel="icon"]');
    var path    = !data.code ? data.path + "?" + Math.floor(Math.random() * 1000000) + 1 : ""
    function setArt () {
      var covers = document.querySelectorAll('[role="background-cover-art"]');
      for (var i = 0; i < covers.length; i++) {
        covers[i].style.backgroundImage = 'url("' + path + '")';
      }
      favicon.href = path
    }
    if (path) {
      var img = new Image()
      img.src = path
      img.onload = setArt
    } else {
      setArt();
      document.querySelector('.now-playing .info [role="background-cover-art"]')
        .style.backgroundImage = 'url("/static/img/default.jpg")'
      favicon.href = '/static/img/default.jpg'
    }
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

MusicLibrary.prototype.init = function() {
  this.getFiles();

  this.audioDiv = document.createElement("AUDIO");
  this.audioDiv.setAttribute("preload", "auto");

  var curTimeDiv = document.getElementById("curinfo-time");
  var thisClass = this;
  this.audioDiv.ontimeupdate = function(e) {
    thisClass.curTimeOffset = this.currentTime;
    curTimeDiv.innerHTML = thisClass.secondsToMinutesStr(thisClass.curTimeOffset);
  }

  this.audioDiv.onended = function() {
    console.log("AUDIO ENDED");
    if (thisClass.streaming && thisClass.audioDiv.src.length > 0)
      thisClass.nextSong();
  }

  document.body.appendChild(this.audioDiv);

  var style = window.getComputedStyle(document.body);
  this.navbarOffset = parseInt(style.getPropertyValue("padding-top").replace('px', ''));

  var curInfo = document.getElementById("curinfo-track");
  if (curInfo) {
    curInfo.addEventListener("click", function() {
        thisClass.openFileDisplayToTrack(thisClass.curTrackInfo);
    });
  }

  this.evtSys.registerEvent('media state change');

  this.apiCall('/api/commands/formats', 'GET', true, function(resp) {
    thisClass.supportedFormats = JSON.parse(resp);
    console.log(thisClass.supportedFormats);

    var formats = document.getElementById('stream-format');
    thisClass.supportedFormats["format"].forEach(function(fmt) {
      var option = document.createElement("option");
      option.value = fmt;
      option.text = fmt.toUpperCase();
      formats.appendChild(option);
    });
    formats.selectedIndex = 0;
    thisClass.updateQualitySelect(thisClass.supportedFormats["format"][0]);

    formats.onchange = function(e) {
        thisClass.updateQualitySelect(e.target.value);
    }
  });

  var open = document.querySelector('[role="open-settings"]')
  open.onclick = function (e) {
    var el = document.querySelector('[role="settings"]')
    el.classList.toggle('open')
  }
}
