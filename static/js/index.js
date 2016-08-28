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
    if (this.streaming)
	return;

    var thisClass = this;
    this.apiCall("/api/commands/info", "POST", true, function(resp) {
	var data = JSON.parse(resp);
	thisClass.curTimeOffset = data.pos;
	if (doneCb)
	    doneCb(data);
    });
}

MusicLibrary.prototype.getPlaybackState = function() {
    return this.playbackState;
}

MusicLibrary.prototype.setFolderView = function(folderIdDiv, view) {

    var folderNode = folderIdDiv.parentNode;
    
    var toggler = folderNode.getElementsByTagName("a")[0];
    if (view === "open")
	toggler.setAttribute("aria-expanded", "true");
    else
	toggler.setAttribute("aria-expanded", "false");
    
    var collapser = folderNode.getElementsByClassName("panel-collapse")[0];
    if (view === "open") {
	collapser.classList.add("in");
	collapser.setAttribute("aria-expanded", "true");
	collapser.style.height = null;
    } else {
	collapser.classList.remove("in");
	collapser.setAttribute("aria-expanded", "true");
    }
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

    if (seconds < 10)
	result += "0";

    result += seconds;
    return result
}

MusicLibrary.prototype.apiCall = function(route, method, async, successCb, errorCb) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
	if (xhttp.readyState == 4 && xhttp.status == 200) {
	    if (successCb)
		successCb(xhttp.responseText);
	} else if (xhttp.readyState == 4) {
	    if (errorCb)
		errorCb(xhttp.responseText);
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

MusicLibrary.prototype.closeDirectory = function(folderDiv) {

    if (folderDiv.classList && folderDiv.classList.contains("folder-entry"))
	return this.closeDirectory(folderDiv.parentNode);
    
    var x = folderDiv.getElementsByClassName("folder-entry");
    for (var i = 0; i < x.length; i++) {
	x[i].style.display="";
	this.setFolderView(x[i].children[0], "close");
    }	
}

MusicLibrary.prototype.displayMakeExcludeButton = function(container) {
	
    var icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-ban-circle exclude-btn";
    icon.setAttribute("aria-hidden", "true");
	
    icon.onclick = function(e) {
	e.preventDefault();
	var nodeID = container.getAttribute('id');	    
	this.mediaHash[nodeID]._exclude = !this.mediaHash[nodeID]._exclude;
	if (this.mediaHash[nodeID]._exclude) {
	    container.style.textDecoration = "line-through";
	    var aElm = container.getElementsByTagName("a");
	    aElm[0].style.pointerEvents = "none";
	    this.closeDirectory(container.parentNode);
	} else {
	    container.style.textDecoration = "";
	    var aElm = container.getElementsByTagName("a");
	    aElm[0].style.pointerEvents = "";
	}
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
    
    //create collapse button
    var collapseButton = document.createElement("a");
    collapseButton.classList.add("folder-entry-name");
    collapseButton.setAttribute("role", "button");
    collapseButton.setAttribute("data-toggle", "collapse");
    collapseButton.setAttribute("href","#" + this.getFolderCollapseId(folderEntry.id));
    if (expanded)
	collapseButton.setAttribute("aria-expanded", "true");
    else
	collapseButton.setAttribute("aria-expanded", "false");
    
    collapseButton.setAttribute("aria-controls", this.getFolderCollapseId(folderEntry.id));
    collapseButton.innerHTML = folderEntry.name;
    panelHeader.appendChild(collapseButton);	
    
    panel = document.createElement("div");
    panel.appendChild(panelHeader);
    panel.classList.add("panel");
    panel.classList.add("folder-entry");
    panel.classList.add("panel-default");
    
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
    file.classList.add("file-entry");
    file.classList.add("panel-heading");

    var thisClass = this;
    text.onclick = function(e) {
	e.preventDefault();
	if (thisClass.streaming) {
	    thisClass.audioDiv.src = '';
	    thisClass.audioDiv.play();
	}
	thisClass.playSong(fileEntry, 0);	
    }
    
    return file;
}

MusicLibrary.prototype.displayFolder = function(folder, parentDiv, depth) {

    var thisClass = this;
    if (!depth) depth = 0;
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
    
    (function(oldDiv, isInView) {
	if (!isInView) {
	    setTimeout(function() {
		console.log("SCROLLING");
		oldDiv.scrollIntoView(true);
		window.scrollBy(0, -this.navbarOffset);
	    }, 500);
	}
    }(lastDiv, inView));
    
    lastDiv.classList.add('playing-entry');
}

MusicLibrary.prototype.showSearch = function(keyword) {

    var thisClass = this;
    keyword = keyword.replace(/^s+|\s+$/g, '');
    keyword = keyword.replace(' ', '%20');
    if (keyword.length <= 0)
	return;
    
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
			    div.parentNode.style.display = "";
			} else
			    div.style.display = "";
		    }
		}
	    }, 10, cchunk, perChunk);
	}
	
	var intervalID = null;
	intervalID = setInterval(function() {
	    if (document.querySelectorAll('.file-entry[style=""]').length >= data.results.length) {
		thisClass.evtSys.dispatchEvent("loading done");
		clearInterval(intervalID);
	    }
	}, 1000);
	
	
	
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
    //round value to one decimal place for mplayer
    var timeoffset = parseFloat(this.curTimeOffset)
    timeoffset = timeoffset.toFixed(1);
    
    this.pauseSong();
    this.streaming = false;
    
    this.playSong(this.curTrackInfo, timeoffset);
}

MusicLibrary.prototype.swapServerToStreaming = function() {
    
    this.pauseSong();
    var thisClass = this;
    this.getTrackPos(function() {
	
	var timeoffset = parseFloat(thisClass.curTimeOffset);
	timeoffset += 0.1;
	timeoffset = timeoffset.toFixed(1);
	thisClass.streaming = true;
	
	thisClass.audioDiv.src = "";
	thisClass.audioDiv.play();
	
	thisClass.playSong(thisClass.curTrackInfo, timeoffset);
	
    });
}
    
MusicLibrary.prototype.swapOutput = function() {
    this.evtSys.dispatchEvent("loading");
    if (this.streaming)
	this.swapStreamingToServer();
    else
	this.swapServerToStreaming();
}

MusicLibrary.prototype.stopSong = function() {
    
    if (!this.streaming) {
	var thisClass = this;
	this.apiCall("/api/commands/stop", "POST", true, function(resp) {
	    thisClass.playbackState = PlayBackStates["STOPPED"];
	    thisClass.evtSys.dispatchEvent('media state change', thisClass.playbackState);
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
	    
	    thisClass.audioDiv.src =   trackData.path + "/" + trackData.name + "?format="+ fmt +
		"&quality=" + quality + "&transcode=" + transcode;
	    
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
    if (this.playHist.length < 1)
	return;
    
    this.curTrackInfo = null;
    var lastTrack = this.playHist.pop();
    this.playSong(lastTrack, 0);
    return;
}



MusicLibrary.prototype.updateTrackInfo = function(doneCb) {
    var thisClass = this;
    this.apiCall("/api/files/"+ this.curTrackInfo.id + "/data", "GET", true, function(resp) {
	var data = JSON.parse(resp);
	var infoStr = '';
	
	if (data.artist.length)
	    infoStr = data.artist + " -- ";
	
	if (!data.title.length)
	    data.title = thisClass.curTrackInfo.name;
	
	infoStr += data.title;
	
	if (data.album.length)
	    infoStr += " (" + data.album + ")";
	
	document.getElementById("curinfo-track").innerHTML = infoStr;
	document.title = infoStr;
	
	var len = thisClass.secondsToMinutesStr(data["length"]);
	document.getElementById("curinfo-totaltime").innerHTML = len;
	if (doneCb)
	    doneCb(data);
    });
}



MusicLibrary.prototype.updateQualitySelect = function(val) {

    var qualityList = document.getElementById('stream-quality');
    //clear options first
    while (qualityList.firstChild)
	qualityList.removeChild(qualityList.firstChild);
    
    
    this.supportedFormats.quality[val].forEach(function(q) {
	var option = document.createElement("option");
	option.value = q;
	option.text = q;
	qualityList.appendChild(option);
    });
    
    qualityList.selectedIndex = 0;
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
    
    document.getElementById('settings-menu').addEventListener('click', function(e) {
	e.stopPropagation();
    });
    
    this.apiCall('/api/commands/formats', 'GET', true, function(resp) {
	thisClass.supportedFormats = JSON.parse(resp);
	console.log(thisClass.supportedFormats);
	
	var formats = document.getElementById('stream-format');
	thisClass.supportedFormats["format"].forEach(function(fmt) {
	    
	    var option = document.createElement("option");
	    option.value = fmt;
	    option.text = fmt;
	    formats.appendChild(option);
	    
	});
	formats.selectedIndex = 0;
	thisClass.updateQualitySelect(thisClass.supportedFormats["format"][0]);
	
	formats.onchange = function(e) {
	    thisClass.updateQualitySelect(e.target.value);
	}
	
    });
}
