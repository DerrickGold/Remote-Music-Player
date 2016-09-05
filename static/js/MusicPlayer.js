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

MusicLibrary.prototype.getRandomTrack = function() {
    var allFiles = Object.keys(this.mediaHash), index = -1;
    while (index < 0 || this.mediaHash[allFiles[index]].directory)
        index = Math.floor((Math.random() * allFiles.length));
    return this.mediaHash[allFiles[index]];
}    

MusicLibrary.prototype.getRootDirDiv = function() {
    return document.getElementById("dirlist");
}

MusicLibrary.prototype.toggleNowPlaying = function(preventClose, forceClose) {    
    var overlay = document.querySelector('[role="currently-playing"]');
    var files = document.querySelector('[role="listroot"]');
    if (forceClose || (!preventClose && overlay.classList.contains("visible"))) {
        overlay.classList.remove("visible");
        files.classList.remove("block-click");
        document.body.classList.remove("lock-scrolling");
    } else {
        files.classList.add("block-click");
        overlay.classList.add("visible");
        document.body.classList.add("lock-scrolling");
    }
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

MusicLibrary.prototype.setFolderView = function(folderIdDiv, view) {
    var folderNode = folderIdDiv.parentNode;
    var toggler = folderNode.querySelector('[role="button"]');
    var collapser = folderNode.querySelector('[role="tabpanel"]');
    var state = view === 'open' ? "true": "false";
    toggler.setAttribute("aria-expanded", state);
    collapser.setAttribute("aria-expanded", state);
    if (view === "open") {
        collapser.classList.add("in");
        collapser.style.height = null;
    } else 
        collapser.classList.remove("in");
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
        if (xhttp.readyState == 4 && xhttp.status == 200)
            if (successCb) successCb(xhttp.responseText);
        else if (xhttp.readyState == 4)
            if (errorCb) errorCb(xhttp.responseText);
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

MusicLibrary.prototype.closeDirectory = function(folderDiv) {
    if (folderDiv.classList && folderDiv.getAttribute('role') === "directory")
        return this.closeDirectory(folderDiv.parentNode);
    var x = folderDiv.querySelectorAll('[role="directory"]');
    for (var i = 0; i < x.length; i++) {
        x[i].classList.remove("hidden");
        this.setFolderView(x[i].children[0], "close");
    } 
}

MusicLibrary.prototype.displayMakeExcludeButton = function(container) {
    var self = this;
    var icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-ban-circle exclude-btn";
    icon.setAttribute("aria-hidden", "true");
    icon.onclick = function(e) {
        e.preventDefault();
        var nodeID = container.getAttribute('id');
        var aElm = container.querySelector("a");
        self.mediaHash[nodeID]._exclude = !self.mediaHash[nodeID]._exclude;
        if (self.mediaHash[nodeID]._exclude) {
            aElm.classList.add("disabled-folder");
            self.closeDirectory(container.parentNode);
        } else
            aElm.classList.remove("disabled-folder");
    }
    return icon;
}

MusicLibrary.prototype.displayMakeFolder = function(folderEntry, expanded, depth) {
    var panelBody = null;
    var panel = null;
    var panelHeader = document.createElement("div");
    panelHeader.setAttribute("id", folderEntry.id);
    panelHeader.classList.add("panel-heading");
    panelHeader.setAttribute("role", "tab");

    var excludeBtn = this.displayMakeExcludeButton(panelHeader);
    panelHeader.appendChild(excludeBtn);

    var icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-folder-close";
    icon.setAttribute("aria-hidden", "true");
    panelHeader.appendChild(icon);

    var collapseButton = document.createElement("a");
    collapseButton.classList.add("folder-entry-name");
    collapseButton.setAttribute("role", "button");
    collapseButton.setAttribute("data-toggle", "collapse");
    collapseButton.setAttribute("href","#" + this.getFolderCollapseId(folderEntry.id));
    collapseButton.setAttribute("aria-expanded", expanded == true ? "true" : "false");
    collapseButton.setAttribute("aria-controls", this.getFolderCollapseId(folderEntry.id));
    collapseButton.innerHTML = folderEntry.name;
    panelHeader.appendChild(collapseButton);  
    panel = document.createElement("div");
    panel.appendChild(panelHeader);
    panel.classList.add("panel", "folder-entry", "panel-default");
    panel.setAttribute("role", "directory");
    
    var bodyCollapse = document.createElement("div");
    bodyCollapse.setAttribute("id", this.getFolderCollapseId(folderEntry.id));
    bodyCollapse.className = "panel-collapse collapse";
    bodyCollapse.setAttribute("role", "tabpanel");
    panelBody = document.createElement("div");
    panelBody.className = "panel-body";
    bodyCollapse.appendChild(panelBody);
    panel.appendChild(bodyCollapse);
    
    return [panel, panelBody];
}

MusicLibrary.prototype.displayMakeFile = function(fileEntry, depth) {
    var file = document.createElement("div");
    file.setAttribute("id", fileEntry.id);
    var icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-music";
    icon.setAttribute("aria-hidden", "true");
    file.appendChild(icon);
    var text = document.createElement("a");
    text.innerHTML = fileEntry.name;
    text.classList.add("file-entry-name");
    text.setAttribute("href", "#");
    file.appendChild(text);
    file.classList.add("file-entry", "panel-heading");
    file.setAttribute("role", "audio-file");
    var self = this;
    text.onclick = function(e) {
        e.preventDefault();
        self.playSong(fileEntry, 0); 
    }
    return file;
}

MusicLibrary.prototype.displayFolder = function(folder, parentDiv, depth) {
    var self = this;
    if (!depth) depth = 0;
    setTimeout(function() {
        folder.children.forEach(function(f) {
            if (f.directory) {
                var things = self.displayMakeFolder(f, false, depth);
                parentDiv.appendChild(things[0]);
                self.displayFolder(f, things[1], depth + 1);
            } else {
                var thing = self.displayMakeFile(f, depth)
                parentDiv.appendChild(thing);
            }
        });
    }, 1);
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
        if (trackFolder) inView = (inView && trackFolder.classList.contains("in"));
    }
    var nodes = this.reverseTrackHashLookup(track);
    var lastDiv = null;
    while(nodes.length > 0) {
        var id = nodes.pop();
        if (this.mediaHash[id].parent == ".") continue;
        if (this.mediaHash[id].directory) {
            lastDiv = document.getElementById(id);
            if (!lastDiv) continue;
            this.setFolderView(lastDiv, "open");
        } else 
            lastDiv = document.getElementById(id);
    }

    var self = this;
    (function(oldDiv, isInView) {
        if (!isInView) {
            setTimeout(function() {
                oldDiv.scrollIntoView(true);
                window.scrollBy(0, -self.navbarOffset);
            }, 500);
        }
    }(lastDiv, inView));
    lastDiv.classList.add('playing-entry');
    this.toggleNowPlaying(true);
}

MusicLibrary.prototype.chunkLibrary = function(library, cb) {
    var perChunk = 5,
        numChunks = parseInt(Math.ceil(library.length/perChunk));
    for (var cchunk = 0; cchunk < numChunks; cchunk++) {
        setTimeout(function(curChunk, numPerChunk) {
            for (var i = 0; i < numPerChunk; i++) {
                var index = i + (curChunk * numPerChunk);
                if (index >= library.length) return;
                var d = library[index];
                if (cb) cb(d);
            }
        }, 1, cchunk, perChunk);
    }   
}

MusicLibrary.prototype.showSearch = function(keyword) {
    var self = this;
    keyword = keyword.replace(/^s+|\s+$/g, '');
    keyword = keyword.replace(' ', '%20');
    if (keyword.length <= 0) return;
    this.toggleNowPlaying(false, true);
    this.evtSys.dispatchEvent("loading");
    this.apiCall("/api/files/search/" + keyword, "GET", true, function(resp) {
        var data = JSON.parse(resp), perChunk = 5,
            numChunks = parseInt(Math.ceil(data.results.length/perChunk));
        
        self.showFiles(false);
        self.chunkLibrary(data.results, function(d) {
            var nodes = self.reverseTrackHashLookup(self.mediaHash[d]);
            //make sure we aren't displaying excluded results
            var skipEntry = false;
            var checkExcluded = nodes.slice(0).reverse();
            while (checkExcluded.length > 0) {
                var id = checkExcluded.pop();
                if (self.mediaHash[id]._exclude) {
                    skipEntry = true;
                    data.results.splice(index, 1);
                    i--;
                    break;
                }
            }
            if (skipEntry) return;
            var song = document.getElementById(d);
            song.classList.remove("hidden");
            while(nodes.length > 0) {
                var nodeID = nodes.pop();
                if (self.mediaHash[nodeID].parent == ".") continue;
                var div = document.getElementById(nodeID);
                if (self.mediaHash[nodeID].directory) {
                    self.setFolderView(div, "open");
                    div.parentNode.classList.remove("hidden");
                } else
                    div.classList.remove("hidden");
            }
        });
        var intervalID = null;
        intervalID = setInterval(function(dataset) {
            if (document.querySelectorAll('[role="audio-file"]:not(.hidden)').length >=
                dataset.length)
            {
                self.evtSys.dispatchEvent("loading done");
                clearInterval(intervalID);
            }
        }, 1000, data.results);
    }, function(resp) {
        self.evtSys.dispatchEvent("loading done");
    }); 
}

MusicLibrary.prototype.showFiles = function(show) {
    var apply = function(el) {
        if (show) el.classList.remove("hidden");
        else el.classList.add("hidden");
    }
    var x = document.querySelectorAll('[role="audio-file"],[role="directory"]');
    this.chunkLibrary(Array.prototype.slice.call(x), apply);
}

MusicLibrary.prototype.clearSearch = function(keyword) {
    this.showFiles(true);
}

MusicLibrary.prototype.swapStreamingToServer = function() {
    //round value to one decimal place for mplayer
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
    this.evtSys.dispatchEvent("loading");
    if (this.curTrackInfo) {
        this.playHist.push(this.curTrackInfo);
        var lastPlayed = document.getElementById(this.curTrackInfo.id);
        lastPlayed.classList.remove('playing-entry');
    }
    this.curTrackInfo = songEntry;
    this.openFileDisplayToTrack(songEntry);
    var self = this;
    if (!this.streaming) {
        var url = "/api/files/" + songEntry.id + "/play";
        if (offset >= 0) url += "?offset=" + offset;
        this.apiCall(url, "GET", true, function(resp) {
            self.playbackState = PlayBackStates["PLAYING"];
            self.evtSys.dispatchEvent('media state change', self.playbackState);
            self.updateTrackInfo();
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
            var srcURL = trackData.path + "/" + trackData.name + "?format="+ fmt +
                "&quality=" + quality + "&transcode=" + transcode;
            
            self.audioDiv.src = encodeURI(srcURL);
            self.audioDiv.play();
            var seekHandler = function(audio) {
                self.audioDiv.removeEventListener('canplay', seekHandler);
                if (offset > 0) audio.target.currentTime = offset;
                self.evtSys.dispatchEvent("loading done");       
            }
            self.audioDiv.addEventListener("canplay",seekHandler);
            self.playbackState = PlayBackStates["PLAYING"];
            self.evtSys.dispatchEvent('media state change', self.playbackState);
            self.updateTrackInfo();
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
            found = directory.children[position].id == lastDir;
            if (found) break;
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
    document.getElementById("curinfo-path").innerHTML = this.curTrackInfo.path;
    this.apiCall("/api/files/"+ this.curTrackInfo.id + "/data", "GET", true, function(resp) {
        var data = JSON.parse(resp),
            infoStr = '',
            title = data.title.length > 0 ? data.title : self.curTrackInfo.name;
        
        document.getElementById("curinfo-track").innerHTML = title;
        document.title = title;
        infoStr = data.artist.length > 0 ? data.artist + " -- " : '';
        infoStr += data.album.length > 0 ? data.album : '';
        document.getElementById("curinfo-artist").innerHTML = infoStr;
        document.getElementById("curinfo-totaltime").innerHTML = self.secondsToMinutesStr(data["length"]);
        if (doneCb) doneCb(data);
    });
    this.apiCall("/api/files/"+ this.curTrackInfo.id + "/cover", "GET", true, function(resp) {
        var data = JSON.parse(resp);
        var cover = document.querySelector('[role="album-art"]');
        if (!data.code) cover.setAttribute("src", data.path + "?" + Math.floor(Math.random() * 10000000) + 1);
        else cover.setAttribute("src", "static/img/default_album_art.png");
    });
}

MusicLibrary.prototype.updateQualitySelect = function(val) {
    var qualityList = document.getElementById('stream-quality');
    //clear options first
    while (qualityList.firstChild) qualityList.removeChild(qualityList.firstChild);
    this.supportedFormats.quality[val].forEach(function(q) {
        var option = document.createElement("option");
        option.value = q;
        option.text = q;
        qualityList.appendChild(option);
    });
    qualityList.selectedIndex = this.supportedFormats.quality[val].length - 1;
}

MusicLibrary.prototype.init = function() {
		var self = this;
    this.getFiles();

		this.audioDiv = document.createElement("AUDIO");
    this.audioDiv.setAttribute("preload", "auto");
    var curTimeDiv = document.getElementById("curinfo-time");
    this.audioDiv.ontimeupdate = function(e) {
        self.curTimeOffset = this.currentTime;
        curTimeDiv.innerHTML = self.secondsToMinutesStr(self.curTimeOffset);
    }
    this.audioDiv.onended = function() {
        if (self.streaming && self.audioDiv.src.length > 0) self.nextSong();
    }
    document.body.appendChild(this.audioDiv);
    
    var style = window.getComputedStyle(document.body);
    this.navbarOffset = parseInt(style.getPropertyValue("padding-top").replace('px', ''));
    var curInfo = document.getElementById("curinfo-track");
    if (curInfo) {
        curInfo.addEventListener("click", function() {
            self.openFileDisplayToTrack(self.curTrackInfo);
        });
    }
    
    this.evtSys.registerEvent('media state change');
    document.getElementById('settings-menu').addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
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
}
