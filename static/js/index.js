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

    this.shuffle = false;
    this.playHist = [];

    this.navbarOffset = "";

    this.reverseTrackHashLookup = function(startNode) {
    
	var findStack = [];
	var curNode = startNode;
	
	while(curNode.parent != ".") {
	    findStack.push(curNode.id);
	    curNode = that.mediaHash[curNode.parent]
	}
	findStack.push(curNode.id);
	return findStack;
    }

    
    this.getRandomTrack = function(directory) {

	if (!directory) directory = that.mediaDir.files;

	var index = Math.floor(Math.random() * (directory.children.length));
	var file = directory.children[index];

	if (file._exclude)
	    return that.getRandomTrack(directory);
	else if (file.directory)
	    return that.getRandomTrack(file);

	return file;
    }    
    
    this.closeDirectory = function(folderDiv) {

	if (folderDiv.classList && folderDiv.classList.contains("FolderEntry"))
	    return this.closeDirectory(folderDiv.parentNode);
	    
	var x = folderDiv.getElementsByClassName("FolderEntry");
	for (var i = 0; i < x.length; i++) {
	    x[i].style.display="";
	    var closeBody = x[i].getElementsByClassName("panel-collapse");
	    for (var z = 0; z < closeBody.length; z++) {
		closeBody[z].classList.remove("in");
	    }
	}	
    }

    this.displayMakeExcludeButton = function(container) {
	
	var icon = document.createElement("span");
	icon.className = "glyphicon glyphicon-ban-circle ExcludeBtn";
	icon.setAttribute("aria-hidden", "true");
	
	icon.onclick = function(e) {
	    e.preventDefault();
	    var nodeID = container.getAttribute('id');	    
	    that.mediaHash[nodeID]._exclude = !that.mediaHash[nodeID]._exclude;
	    if (that.mediaHash[nodeID]._exclude) {
		container.style.textDecoration = "line-through";
		var aElm = container.getElementsByTagName("a");
		aElm[0].style.pointerEvents = "none";
		that.closeDirectory(container.parentNode);
	    } else {
		container.style.textDecoration = "";
		var aElm = container.getElementsByTagName("a");
		aElm[0].style.pointerEvents = "";
	    }
	}

	return icon;
    }
    
    this.displayMakeFolder = function(folderEntry, expanded, depth) {
	var panelBody = null;
	var panel = null;
	var panelHeader = document.createElement("div");
	panelHeader.setAttribute("id", folderEntry.id);
	panelHeader.classList.add("panel-heading");
	panelHeader.setAttribute("role", "tab");

	var excludeBtn = that.displayMakeExcludeButton(panelHeader);
	panelHeader.appendChild(excludeBtn);
	
	var icon = document.createElement("span");
	icon.className = "glyphicon glyphicon-folder-close";
	icon.setAttribute("aria-hidden", "true");
	panelHeader.appendChild(icon);
	
	//create collapse button
	var collapseButton = document.createElement("a");
	collapseButton.classList.add("FolderEntryText");
	collapseButton.setAttribute("role", "button");
	collapseButton.setAttribute("data-toggle", "collapse");
	collapseButton.setAttribute("href","#" + that.getFolderCollapseId(folderEntry.id));
	if (expanded)
	    collapseButton.setAttribute("aria-expanded", "true");
	else
	    collapseButton.setAttribute("aria-expanded", "false");
	    
	collapseButton.setAttribute("aria-controls", that.getFolderCollapseId(folderEntry.id));
	collapseButton.innerHTML = folderEntry.name;
	panelHeader.appendChild(collapseButton);	

	
	panel = document.createElement("div");
	panel.appendChild(panelHeader);
	panel.classList.add("panel");
	panel.classList.add("FolderEntry");
	panel.classList.add("panel-default");
	
	
	var bodyCollapse = document.createElement("div");
	bodyCollapse.setAttribute("id", that.getFolderCollapseId(folderEntry.id));
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

	text.onclick = function(e) {
	    e.preventDefault();
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
		that.displayFolder(f, things[1], depth + 1);
	    } else {
		var thing = that.displayMakeFile(f, depth)
		parentDiv.appendChild(thing);
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


    this.openFileDisplayToTrack = function(track) {

	//first check if item is not already in viewport before scrolling
	var trackDiv = document.getElementById(track.id);
	var inView = false;
	if (trackDiv) {
	    var trackDivBox = trackDiv.getBoundingClientRect();
	    inView = (trackDivBox.top >= 0 && trackDivBox.left >= 0 &&
		      trackDivBox.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
		      trackDivBox.right <= (window.innerWidth || document.documentElement.clientWidth));

	    //check if folder is open too
	    var trackFolder = document.getElementById(that.getFolderCollapseId(track.parent));
	    if (trackFolder)
		inView = (inView && trackFolder.classList.contains("in"));
	}

	var nodes = that.reverseTrackHashLookup(track);
	var lastDiv = null;

	while(nodes.length > 0) {
	    var id = nodes.pop();

	    //skip root dir
	    if (that.mediaHash[id].parent == ".")
		continue;

	    if (that.mediaHash[id].directory) {
		lastDiv = document.getElementById(id);
		if (!lastDiv)
		    continue;
		
		//expand accordion views
		var collapse = document.getElementById(that.getFolderCollapseId(id));
		collapse.classList.add("in");
		//set the expanded attribute
		var fileEntryText = collapse.parentNode.getElementsByClassName("FolderEntryText")[0];
		if (fileEntryText)
		    fileEntryText.setAttribute("aria-expanded", "true");
		
	    } else 
		lastDiv = document.getElementById(id);
	}
	(function(oldDiv, isInView) {
	    if (!isInView) {
		setTimeout(function() {
		    console.log("SCROLLING");
		    oldDiv.scrollIntoView(true);
		    window.scrollBy(0, -that.navbarOffset);
		}, 500);
	    }
	}(lastDiv, inView));
	
	lastDiv.classList.add('PlayingEntry');
    }

    this.showSearch = function(keyword) {

	keyword = keyword.replace(/^s+|\s+$/g, '');
	keyword = keyword.replace(' ', '%20');
	if (keyword.length <= 0)
	    return;

	that.evtSys.dispatchEvent("loading");
	
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
			    console.log(that.mediaHash[nodeID]);
			    if (that.mediaHash[nodeID].parent == ".")
				continue;
			    
			    var div = document.getElementById(nodeID);
			    if (that.mediaHash[nodeID].directory) {
				div.parentNode.style.display = "";
				var collapse = document.getElementById(that.getFolderCollapseId(nodeID));
				collapse.classList.add("in");
				var fileEntryText = collapse.parentNode.getElementsByClassName("FolderEntryText")[0];
				if (fileEntryText)
				    fileEntryText.setAttribute("aria-expanded", "true");
			    } else
				div.style.display = "";
			}
		    }
		}, 10, cchunk, perChunk, data.results);
	    }
	}, function(resp) {
	    that.evtSys.dispatchEvent("loading done");
	});	
    }

    this.clearSearch = function(keyword) {

	that.closeDirectory(document);

	var x = document.getElementsByClassName("FileEntry");
	for (var i = 0; i < x.length; i++) {
	    x[i].style.display="";
	}
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

		var streamOptions = document.getElementById("stream-quality");
		var quality = streamOptions.options[streamOptions.selectedIndex].value;

		var transcodeOptions = document.getElementById("transcoding-option");
		var transcode = transcodeOptions.options[transcodeOptions.selectedIndex].value;
		
		that.audioDiv.src =   trackData.path + "/" + trackData.name + "?quality=" + quality +
		    "&transcode=" + transcode;
		
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
	} else {
	    var nodes = that.reverseTrackHashLookup(that.curTrackInfo).reverse();
	    var lastDir = that.curTrackInfo.id;

	    while (nodes.length > 0) {
		var popped = nodes.pop();
		var directory = that.mediaHash[popped];

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
		that.playSong(nextTrack, 0);
		return;
	    }
	}
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

	    var infoStr = '';
	    
	    if (data.artist.length)
		infoStr = data.artist + " -- ";
	    
	    if (!data.title.length)
		data.title = that.curTrackInfo.name;
	    
	    infoStr += data.title;
	    
	    if (data.album.length)
		infoStr += " (" + data.album + ")";

	    document.getElementById("CurTrackInfo").innerHTML = infoStr;
	    document.title = infoStr;

	    var len = that.secondsToMinutesStr(data["length"]);
	    document.getElementById("CurInfoTotalTime").innerHTML = len;
	    if (doneCb)
		doneCb(data);
	});
    }

    this.getPlaybackState = function() {
	return that.playbackState;
    }

    
    this.init = function() {
	that.getFiles();

	that.audioDiv = document.createElement("AUDIO");
	that.audioDiv.setAttribute("preload", "auto");
	
	var curTimeDiv = document.getElementById("CurInfoTime");
	that.audioDiv.ontimeupdate = function(e) {
	    that.curTimeOffset = this.currentTime;
	    curTimeDiv.innerHTML = that.secondsToMinutesStr(that.curTimeOffset);
	}

	that.audioDiv.onended = function() {
	    console.log("AUDIO ENDED");
	    if (that.streaming && that.audioDiv.src.length > 0)
		that.nextSong();
	}
	
	document.body.appendChild(that.audioDiv);
	

	var style = window.getComputedStyle(document.body);
	that.navbarOffset = parseInt(style.getPropertyValue("padding-top").replace('px', ''));

	var curInfo = document.getElementById("CurTrackInfo");
	if (curInfo) {
	    curInfo.addEventListener("click", function() {
		that.openFileDisplayToTrack(that.curTrackInfo);
	    });
	}
	that.evtSys.registerEvent('media state change');

	document.getElementById('settings-menu').addEventListener('click', function(e) {
	    e.stopPropagation();
	});
    }

    this.init();
}

MusicLibrary.prototype.secondsToMinutesStr = function(time) {

    time = parseInt(time);
    var minutes = Math.floor(time / 60);
    var seconds = time % 60;

    var result = '' + minutes + ":";

    if (seconds < 10)
	result += "0";

    result += seconds;
    return result
}


MusicLibrary.prototype.getFolderCollapseId = function(directoryID) {
    return "collapse-" + directoryID;
}


MusicLibrary.prototype.apiCall = function(route, method, async, successCb, errorCb) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
	if (xhttp.readyState == 4 && xhttp.status == 200) {
	    if (successCb)
		successCb(xhttp.responseText);
	} else if (xhttp.readyState > 0 && xhttp.status != 200) {
	    if (errorCb)
		errorCb(xhttp.responseText);
	}
    }

    xhttp.open(method, route, async);
    xhttp.send();	
}

MusicLibrary.prototype.getRootDirDiv = function() {
    return document.getElementById("dirlist");
}

