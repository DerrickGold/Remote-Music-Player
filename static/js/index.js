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
    this.curTrackID = '';
    this.curTimeOffset = 0;
    
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
		    that.playSong(f.id, 0);
		}
	    };
	    

	    entry.style.marginLeft = (that.indentSize * depth) + "px";
	    parentDiv.appendChild(entry);

	});
    }
    

    this.getFiles = function() {

	xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	    if (xhttp.readyState == 4 && xhttp.status == 200) {
		that.mediaDir = JSON.parse(xhttp.responseText);
		that.displayFolder(that.mediaDir.files, that.getRootDirDiv());
	    }
	}


	xhttp.open("GET", "/api/files", true);
	xhttp.send();
    }

    this.swapOutput = function() {
	
	var timeoffset = 0;

	console.log(that.audioDiv);
	if (that.streaming)
	    timeoffset = parseInt(that.curTimeOffset);

	that.pauseSong();
	//that.stopSong();
	that.streaming = !that.streaming;
	console.log("Streaming: " + that.streaming);

	that.audioDiv.src = "";
	if (that.streaming)
	    that.audioDiv.play();
	
	that.playSong(that.curTrackId, timeoffset);
	
    }

    this.stopSong = function() {

	if (!that.streaming) {
	    xhttp = new XMLHttpRequest();
	    xhttp.onreadystatechange = function() {
		console.log("ready: " + xhttp.readyState);
		console.log("status: " + xhttp.status);
		if (!xhttp.status || xhttp.status == 200) {
		    that.playbackState = PlayBackStates["STOPPED"];
		    that.evtSys.dispatchEvent('media state change', that.playbackState);
		}
	    }
	    xhttp.open("POST", "/api/commands/stop");
	    xhttp.send();
	} else {
	    that.audioDiv.pause();
	    that.audioDiv.src = "";
	}

    }

    
    this.playSong = function(id, offset) {
	console.log("OFFSET: " + offset);
	that.curTrackId = id;
	
	if (!that.streaming) {
	    //not streaming, tell server to play file
	    xhttp = new XMLHttpRequest();
	    xhttp.onreadystatechange = function() {
		console.log("ready: " + xhttp.readyState);
		console.log("status: " + xhttp.status);
		if (!xhttp.status || xhttp.status == 200) {
		    that.playbackState = PlayBackStates["PLAYING"];
		    that.evtSys.dispatchEvent('media state change', that.playbackState);
		}
	    }
	    var url = "/api/files/" + id + "/play";
	    if (offset >= 0)
		url += "?offset=" + offset;
	    console.log("URL: " + url);
	    
	    xhttp.open("GET", url);
	    xhttp.send();
	    that.updateTrackInfo();
	} else {
	    //if we are streaming, get audio file path to add to local web player
	    xhttp = new XMLHttpRequest();
	    xhttp.onreadystatechange = function() {
		console.log("ready: " + xhttp.readyState);
		console.log("status: " + xhttp.status);
		if (xhttp.readyState == 4 && xhttp.status == 200) {
		    var trackData = JSON.parse(xhttp.responseText);
		    that.audioDiv.src =   trackData.path + "/" + trackData.name;
		    that.audioDiv.play();
		    that.playbackState = PlayBackStates["PLAYING"];
		    that.evtSys.dispatchEvent('media state change', that.playbackState);
		}
	    }
	    xhttp.open("GET", "/api/files/" + id);
	    xhttp.send();
	}
    }

    this.pauseSong = function() {
	if (!that.streaming) {
	    xhttp = new XMLHttpRequest();

	    xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
		    that.playbackState = PlayBackStates["PAUSED"];
		    that.evtSys.dispatchEvent('media state change', that.playbackState);
		}
	    }
	   
	    xhttp.open("POST", "/api/commands/pause");
	    xhttp.send();
	} else {
	    that.audioDiv.pause();
	    that.playbackState = PlayBackStates["PAUSED"];
	    that.evtSys.dispatchEvent('media state change', that.playbackState);
	}
    }

    
    this.unpauseSong = function() {
	if (!that.streaming) {
	    //server operates using a toggle
	    xhttp = new XMLHttpRequest();
	    xhttp.onreadystatechange = function() {
		if (!xhttp.status ||  xhttp.status == 200) {
		    that.playbackState = PlayBackStates["PLAYING"];
		    that.evtSys.dispatchEvent('media state change', that.playbackState);
		}
	    }

	    xhttp.open("POST", "/api/commands/pause");
	    xhttp.send();
	}
	else {
	    that.audioDiv.play();
	    that.playbackState = PlayBackStates["PLAYING"];
	    that.evtSys.dispatchEvent('media state change', that.playbackState);
	}
    }

    
    this.updateTrackInfo = function() {
	xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	    if (xhttp.readyState == 4 && xhttp.status == 200) {
		var data = JSON.parse(xhttp.responseText);
		
		document.getElementById("curInfo-artist").innerHTML = data.artist;
		document.getElementById("curInfo-title").innerHTML = data.title;
		document.getElementById("curInfo-album").innerHTML = data.album;
		
	    }
	}
	xhttp.open("POST", "/api/commands/info");
	xhttp.send();
    }

    this.getPlaybackState = function() {
	return that.playbackState;
    }

    
    this.init = function() {
	that.getFiles();

//	if (that.streaming) {
	    //if streaming, create the audio player on the page
	that.audioDiv = document.createElement("AUDIO");
	that.audioDiv.ontimeupdate = function(e) {
	    console.log("UPDATE: ");
	    console.log(e);
	    console.log(this.currentTime);
	    that.curTimeOffset = this.currentTime;
	}
	    document.body.appendChild(that.audioDiv);
//	}

	that.evtSys.registerEvent('media state change');
    }

    this.init();
}
