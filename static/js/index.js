PlayBackStates = {
    "STOPPED": -1,
    "PLAYING": 0,
    "PAUSED": 1
}

MusicLibrary = function(evtSys, doStreaming) {

    var that = this;
    this.mediaDir = null;
    this.indentSize = 10;
    this.audioDiv = null;
    this.streaming = doStreaming;
    this.playbackState = PlayBackStates["STOPPED"];
    this.evtSys = evtSys;
    this.curTrack = [];
    this.curTimeOffset = 0;


    this.apiCall = function(route, method, async, successCb) {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	    if ( xhttp.readyState == 4 && xhttp.status == 200) {
		if (successCb)
		    successCb(xhttp.responseText);
	    }
	}

	xhttp.open(method, route, async);
	xhttp.send();	
    }
    
    this.getRootDirDiv = function() {
	return document.getElementById("dirlist");
    }
    
    this.clearDirectoryBrowser = function() {
	var masterListDiv = that.getRootDirDiv();

	while (masterListDiv.firstChild) {
	    masterListDiv.removeChild(masterListDiv.firstChild);
	}
    }
    
    this.closeDirectory = function(folderDiv) {
	while (folderDiv.nextSibling) {
	    folderDiv.parentNode.removeChild(folderDiv.nextSibling);
	}
    }
    
    this.displayFolder = function(folder, parentDiv, depth) {

	if (!depth) depth = 0;
	
	folder.children.forEach(function(f) {

	    var entryHeader = document.createElement("div");
	    entryHeader.innerHTML = f.name;
	    var entry = entryHeader;

	    
	    if (f.directory) {
		entryHeader.className = "FolderEntry";
		var folderContent = document.createElement("div");
		folderContent.appendChild(entryHeader);
		entry = folderContent;
	    } else
		entryHeader.className = "FileEntry";
	    
	    entryHeader.onclick = function() {
		if (f.directory) {
		    if (!f._opened) {
			that.displayFolder(f, entry, depth+1);
			f._opened = true;
		    } else {
			that.closeDirectory(entryHeader);
			f._opened = false;
		    }
		}
		else {
		    //gain audio player control on mobile devices
		    if (that.streaming) {
			that.audioDiv.src = '';
		    	that.audioDiv.play();
		    }
		    that.playSong(f, 0);
		}
	    };
	    

	    entry.style.marginLeft = (that.indentSize * depth) + "px";
	    parentDiv.appendChild(entry);

	});
    }
    

    this.getFiles = function() {
	that.apiCall("/api/files", "GET", true, function(resp) {
	    that.mediaDir = JSON.parse(resp);
	    that.displayFolder(that.mediaDir.files, that.getRootDirDiv());
	});
    }

    this.swapOutput = function() {
	
	var timeoffset = 0;

	console.log(that.audioDiv);
	if (that.streaming)
	    timeoffset = that.curTimeOffset;
	else {
	    that.updateTrackInfo();
	    timeoffset = that.curTimeOffset;
	}

	that.pauseSong();
	that.streaming = !that.streaming;

	that.audioDiv.src = "";
	if (that.streaming)
	    that.audioDiv.play();
	
	that.playSong(that.curTrack, timeoffset);
	
    }

    this.stopSong = function() {

	if (!that.streaming) {
	    that.apiCall("/api/commands/stop", "POST", false, function(resp) {
		that.playbackState = PlayBackStates["STOPPED"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
	    });
	} else {
	    that.audioDiv.pause();
	}

    }

    
    this.playSong = function(songEntry, offset) {
	console.log("OFFSET: " + offset);
	that.curTrack = songEntry;
	
	if (!that.streaming) {
	    //not streaming, tell server to play file
	    var url = "/api/files/" + songEntry.id + "/play";
	    if (offset >= 0)
		url += "?offset=" + offset;
	    
	    that.apiCall(url, "GET", false, function(resp) {
		that.playbackState = PlayBackStates["PLAYING"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
	    });

	    that.updateTrackInfo();
	} else {
	    //if we are streaming, get audio file path to add to local web player
	    that.apiCall("/api/files/" + songEntry.id, "GET", false, function(resp) {
		var trackData = JSON.parse(resp);
		that.audioDiv.src =   trackData.path + "/" + trackData.name;
		that.audioDiv.currentTime = offset;
		that.audioDiv.play();
		
		that.playbackState = PlayBackStates["PLAYING"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);		
	    });
	}
    }

    this.pauseSong = function() {
	if (!that.streaming) {
	    that.apiCall("/api/commands/pause", "POST", false, function(resp) {
		that.playbackState = PlayBackStates["PAUSED"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
	    });
	} else {
	    that.audioDiv.pause();
	    that.playbackState = PlayBackStates["PAUSED"];
	    that.evtSys.dispatchEvent('media state change', that.playbackState);
	}
    }

    
    this.unpauseSong = function() {
	if (!that.streaming) {
	    //server operates using a toggle	    
	    that.apiCall("/api/commands/pause", "POST", false, function(resp) {
		that.playbackState = PlayBackStates["PLAYING"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
	    });
	}
	else {
	    that.audioDiv.play();
	    that.playbackState = PlayBackStates["PLAYING"];
	    that.evtSys.dispatchEvent('media state change', that.playbackState);
	}
    }

    
    this.updateTrackInfo = function() {
	that.apiCall("/api/commands/info", "POST", false, function(resp) {
	    var data = JSON.parse(resp);
	    document.getElementById("curInfo-artist").innerHTML = data.artist;
	    document.getElementById("curInfo-title").innerHTML = data.title;
	    document.getElementById("curInfo-album").innerHTML = data.album;
	    that.curTimeOffset = data.pos;
	});
    }

    this.getPlaybackState = function() {
	return that.playbackState;
    }

    
    this.init = function() {
	that.getFiles();

	that.audioDiv = document.createElement("AUDIO");
	that.audioDiv.ontimeupdate = function(e) {
	    that.curTimeOffset = this.currentTime;
	}
	document.body.appendChild(that.audioDiv);

	that.evtSys.registerEvent('media state change');
    }

    this.init();
}
