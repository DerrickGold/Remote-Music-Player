PlayBackStates = {
    "STOPPED": -1,
    "PLAYING": 0,
    "PAUSED": 1
}

MusicLibrary = function(evtSys, doStreaming) {

    var that = this;
    this.mediaDir = null;
    this.mediaHash = {};
    
    this.indentSize = 10;
    this.audioDiv = null;
    this.streaming = doStreaming;
    this.playbackState = PlayBackStates["STOPPED"];
    this.evtSys = evtSys;
    this.curTrackInfo = null;
    this.curTimeOffset = 0;

    this.shuffle = true;
    this.playHist = [];

    this.navbarOffset = "";



    
    this.getRandomTrack = function(directory) {

	if (!directory) directory = that.mediaDir.files;

	var index = Math.floor(Math.random() * (directory.children.length - 1));
	var file = directory.children[index];

	if (file.directory)
	    return that.getRandomTrack(file);

	return file;
    }
    

    this.apiCall = function(route, method, async, successCb) {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	    if (xhttp.readyState == 4 && xhttp.status == 200) {
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

    this.displayMakeFolder = function(folderEntry, expanded, depth) {
	var panelBody = null;
	var panel = null;
	var panelHeader = document.createElement("div");
	panelHeader.setAttribute("id", folderEntry.id);
	panelHeader.classList.add("panel-heading");
	panelHeader.setAttribute("role", "tab");

	var icon = document.createElement("span");
	icon.className = "glyphicon glyphicon-folder-close";
	icon.setAttribute("aria-hidden", "true");
	panelHeader.appendChild(icon);
	
	//create collapse button
	var collapseButton = document.createElement("a");
	collapseButton.classList.add("FolderEntryText");
	collapseButton.setAttribute("role", "button");
	collapseButton.setAttribute("data-toggle", "collapse");
	
//	if (depth == 0)
//	    collapseButton.setAttribute("data-parent", "#dirlist");
//	else
//	    collapseButton.setAttribute('data-parent', '#' + folderEntry.id);
	
	collapseButton.setAttribute("href", "#collapse-"+folderEntry.id);
	if (expanded)
	    collapseButton.setAttribute("aria-expanded", "true");
	else
	    collapseButton.setAttribute("aria-expanded", "false");
	    
	collapseButton.setAttribute("aria-controls", "collapse-"+folderEntry.id);
	collapseButton.innerHTML = folderEntry.name;
	panelHeader.appendChild(collapseButton);
	

	
	panel = document.createElement("div");
	panel.appendChild(panelHeader);
	panel.classList.add("panel");
	panel.classList.add("FolderEntry");
	panel.classList.add("panel-default");
	
	
	var bodyCollapse = document.createElement("div");
	bodyCollapse.setAttribute("id", "collapse-"+folderEntry.id);
	bodyCollapse.className = "panel-collapse collapse";
	bodyCollapse.setAttribute("role", "tabpanel");
	
	
	panelBody = document.createElement("div");
	panelBody.className = "panel-body";
	
	bodyCollapse.appendChild(panelBody);
	panel.appendChild(bodyCollapse);
	return [panel, panelBody];
    }

    this.displayMakeFile = function(fileEntry, depth) {
	var file = document.createElement("div");
	file.setAttribute("id", fileEntry.id);

	var icon = document.createElement("span");
	icon.className = "glyphicon glyphicon-music";
	icon.setAttribute("aria-hidden", "true");
	file.appendChild(icon);

	var text = document.createElement("a");
	text.innerHTML = fileEntry.name;
	text.classList.add("FileEntryText");
	text.setAttribute("href", "#");
	
	file.appendChild(text);
	file.classList.add("FileEntry");
	file.classList.add("panel-heading");

	file.onclick = function() {
	    if (that.streaming) {
		that.audioDiv.src = '';
		that.audioDiv.play();
	    }
	    that.playSong(fileEntry, 0);
	}

	return file;
    }
    
    this.displayFolder = function(folder, parentDiv, depth) {

	if (!depth) depth = 0;
	
	folder.children.forEach(function(f) {
	    if (f.directory) {
		var things = that.displayMakeFolder(f, false, depth);
		parentDiv.appendChild(things[0]);

/*		setTimeout(function() {
		    
		    var collapser = document.getElementById("collapse-" + f.id);
			//things[0].getElementsByClassName("collapse")[0];
		    console.log(collapser);
		    collapser.addEventListener("hide bs collapse", function() {
			console.log("COLLAPSED");
		    });

		    collapser.addEventListener("click", function() {
			console.log("CLICKED");
		    });
		    }, 1000);*/
		
		that.displayFolder(f, things[1], depth + 1);
	    } else {
		parentDiv.appendChild(that.displayMakeFile(f, depth));
	    }
	});
    }

    this.makeMediaLibHash = function(root) {

	that.mediaHash[root.id] = root;

	for(var i = 0; i < root.children.length; i++) {
	    this.makeMediaLibHash(root.children[i]);
	}
    }
    

    this.getFiles = function() {
	that.evtSys.dispatchEvent("loading");
	that.apiCall("/api/files", "GET", true, function(resp) {
	    that.mediaDir = JSON.parse(resp);
	    that.makeMediaLibHash(that.mediaDir.files);
	    that.displayFolder(that.mediaDir.files, that.getRootDirDiv());
	    that.evtSys.dispatchEvent("loading done");
	});
    }


    
    this.reverseTrackHashLookup = function(startNode) {

	var findStack = [];
	var curNode = startNode;
	
	while(curNode.parent != ".") {
	    findStack.push(curNode.id);
	    curNode = that.mediaHash[curNode.parent]
	}

	return findStack;
    }


    this.openFileDisplayToTrack = function(track) {

	var nodes = that.reverseTrackHashLookup(track);
	var lastDiv = null;

	while(nodes.length > 0) {
	    var id = nodes.pop();

	    if (that.mediaHash[id].directory) {
		lastDiv = document.getElementById(id);
		if (!lastDiv)
		    continue;
		
		//expand accordion views
		lastDiv.parentNode.children[1].classList.remove("collapse");
		lastDiv.parentNode.children[1].classList.add("in");
	    } else 
		lastDiv = document.getElementById(id);
	}

	setTimeout(function() {
	    lastDiv.scrollIntoView(true);
	    window.scrollBy(0, -that.navbarOffset);
	}, 500);
	
	lastDiv.classList.add('PlayingEntry');
    }

    this.showSearch = function(keyword) {

	that.evtSys.dispatchEvent("loading");
	keyword = keyword.replace(' ', '%20');
	that.apiCall("/api/files/search/" + keyword, "GET", true, function(resp) {
	    var data = JSON.parse(resp);

	    //make everything hidden, then only show search results
	    var x = document.getElementsByClassName("FileEntry");
	    for (var i = 0; i < x.length; i++)
		x[i].style.display = "none";

	    x = document.getElementsByClassName("FolderEntry");
	    for (var i = 0; i < x.length; i++)
		x[i].style.display = "none";
	   
	    var perChunk = 5;
	    var numChunks = parseInt(Math.ceil(data.results.length/perChunk));
	    for (var cchunk = 0; cchunk < numChunks; cchunk++) {

		setTimeout(function(curChunk, numPerChunk, results) {
		    for (var i = 0; i < numPerChunk; i++) {
			    
			var index = i + (curChunk * numPerChunk);
			if (index >= results.length) {
			    that.evtSys.dispatchEvent("loading done");
			    return;
			}

			var d = results[index];
			var song = document.getElementById(d);
			song.style.display = "block";

			var nodes = that.reverseTrackHashLookup(that.mediaHash[d]);
			while(nodes.length > 0) {
			    var nodeID = nodes.pop();
			    var div = document.getElementById(nodeID);
			    if (that.mediaHash[nodeID].directory) {
				div.parentNode.style.display = "block";
				div.parentNode.children[1].classList.remove("collapse");
				div.parentNode.children[1].classList.add("in");
			    } else
				div.style.display = "block";
			}
		    }
		}, 10, cchunk, perChunk, data.results);
	    }
	});	
    }

    this.clearSearch = function(keyword) {

	var x = document.getElementsByClassName("FileEntry");
	for (var i = 0; i < x.length; i++)
	    x[i].style.display="block";


	x = document.getElementsByClassName("FolderEntry");
	for (var i = 0; i < x.length; i++)
	    x[i].style.display="block";

    }

    
    this.swapStreamingToServer = function() {
	//round value to one decimal place for mplayer
	var timeoffset = parseFloat(that.curTimeOffset)
	timeoffset = timeoffset.toFixed(1);

	that.pauseSong();
	that.streaming = false;

	that.playSong(that.curTrackInfo, timeoffset);
    }

    this.swapServerToStreaming = function() {

	that.pauseSong();
	that.getTrackPos(function() {
	    
	    var timeoffset = parseFloat(that.curTimeOffset);
	    timeoffset += 0.1;
	    timeoffset = timeoffset.toFixed(1);
	    that.streaming = true;

	    that.audioDiv.src = "";
	    that.audioDiv.play();

	    that.playSong(that.curTrackInfo, timeoffset);

	});
    }
    
    this.swapOutput = function() {
	that.evtSys.dispatchEvent("loading");
	if (that.streaming)
	    that.swapStreamingToServer();
	else
	    that.swapServerToStreaming();
    }

    this.stopSong = function() {

	if (!that.streaming) {
	    that.apiCall("/api/commands/stop", "POST", true, function(resp) {
		that.playbackState = PlayBackStates["STOPPED"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
	    });
	} else {
	    that.audioDiv.pause();
	}

    }
    
    this.playSong = function(songEntry, offset) {

	that.evtSys.dispatchEvent("loading");
	if (that.curTrackInfo) {
	    that.playHist.push(that.curTrackInfo);
	    var lastPlayed = document.getElementById(that.curTrackInfo.id);
	    lastPlayed.classList.remove('PlayingEntry');
	}

	console.log("History len: " + that.playHist.length);	
	console.log("OFFSET: " + offset);
	that.curTrackInfo = songEntry;
	that.openFileDisplayToTrack(songEntry);
	
	if (!that.streaming) {
	    //not streaming, tell server to play file
	    var url = "/api/files/" + songEntry.id + "/play";
	    if (offset >= 0)
		url += "?offset=" + offset;
	    
	    that.apiCall(url, "GET", true, function(resp) {
		that.playbackState = PlayBackStates["PLAYING"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
		that.updateTrackInfo();
		that.evtSys.dispatchEvent("loading done");
	    });

	    
	} else {
	    //if we are streaming, get audio file path to add to local web player
	    that.apiCall("/api/files/" + songEntry.id, "GET", true, function(resp) {

		var trackData = JSON.parse(resp);
		that.audioDiv.src =   trackData.path + "/" + trackData.name;
		that.audioDiv.play();

		var seekHandler = function(audio) {
		    that.audioDiv.removeEventListener('canplay', seekHandler);
		    audio.target.currentTime = offset;
		    that.evtSys.dispatchEvent("loading done");		    
		}
		that.audioDiv.addEventListener("canplay",seekHandler);
		
		that.playbackState = PlayBackStates["PLAYING"];
		that.evtSys.dispatchEvent('media state change', that.playbackState);
		that.updateTrackInfo();
	    });
	}
    }

    this.pauseSong = function() {
	if (!that.streaming) {
	    that.apiCall("/api/commands/pause", "POST", true, function(resp) {
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
	    that.apiCall("/api/commands/pause", "POST", true, function(resp) {
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

    this.nextSong = function() {


	if (that.shuffle) {
	    var track = that.getRandomTrack();
	    that.playSong(track, 0);
	    return;
	}
	
	that.apiCall("/api/files/next", "GET", true, function(resp) {
	    var file = JSON.parse(resp);
	    
	    that.playSong(file, 0);
	    that.playbackState = PlayBackStates["PLAYING"];
	    that.evtSys.dispatchEvent('media state change', that.playbackState);

	    if (!that.streaming)
		that.updateTrackInfo();
	});
	
    }

    this.prevSong = function() {
	if (that.playHist.length < 1)
	    return;

	that.curTrackInfo = null;
	var lastTrack = that.playHist.pop();
	that.playSong(lastTrack, 0);
	return;
    }

    this.getTrackPos = function(doneCb) {

	//don't need to query the server if we are streaming
	if (that.streaming)
	    return;
	
	this.apiCall("/api/commands/info", "POST", true, function(resp) {
	    var data = JSON.parse(resp);
	    that.curTimeOffset = data.pos;
	    if (doneCb) doneCb(data);
	});
    }
    
    this.updateTrackInfo = function(doneCb) {
	that.apiCall("/api/files/"+ that.curTrackInfo.id + "/data", "GET", true, function(resp) {
	    var data = JSON.parse(resp);

	    if (!data.artist.length) data.artist = "UNKNOWN ARTIST";
	    if (!data.title.length) data.title = that.curTrackInfo.name;
	    if (!data.album.length) data.album = "UNKNOWN ALBUM";

	    var infoStr = data.artist + " -- " + data.title + " (" + data.album + ")";
	    document.getElementById("CurTrackInfo").innerHTML = infoStr;
	    document.title = infoStr;
	    if (doneCb) doneCb(data);
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

	that.audioDiv.onended = function() {
	    console.log("AUDIO ENDED");
	    if (that.streaming && that.audioDiv.src.length > 0)
		that.nextSong();
	}
	
	document.body.appendChild(that.audioDiv);

	that.evtSys.registerEvent('media state change');

	console.log(document.body.style);

	var style = window.getComputedStyle(document.body);
	that.navbarOffset = parseInt(style.getPropertyValue("padding-top").replace('px', ''));
    }

    this.init();
}
