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
	
	//create collapse button
	var collapseButton = document.createElement("a");
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

	file.innerHTML = fileEntry.name;
	file.className = "FileEntry";

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
	that.apiCall("/api/files", "GET", true, function(resp) {
	    that.mediaDir = JSON.parse(resp);
	    console.log(that.mediaDir);
	    that.makeMediaLibHash(that.mediaDir.files);
	    that.displayFolder(that.mediaDir.files, that.getRootDirDiv());
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
	console.log(nodes);
	var lastDiv = null;

	while(nodes.length > 0) {
	    var id = nodes.pop();

	    if (that.mediaHash[id].directory) {
		lastDiv = document.getElementById(id).children[0];
		if (!lastDiv)
		    continue;

		console.log("EXPANDED: " + lastDiv.getAttribute("aria-expanded"));
		if (lastDiv.getAttribute("aria-expanded") == 'false')
		    lastDiv.click();
		
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
	
	keyword = keyword.replace(' ', '%20');
	that.apiCall("/api/files/search/" + keyword, "GET", true, function(resp) {
	    var data = JSON.parse(resp);


	    //make everything hidden, then only show search results
	    var x = document.getElementsByClassName("FileEntry");
	    for (var i = 0; i < x.length; i++) 
		x[i].style.display="none";


	    x = document.getElementsByClassName("FolderEntry");
	    for (var i = 0; i < x.length; i++)
		x[i].style.display="none";



	    data.results.forEach(function(d) {
		console.log("ENABLE: ");
		console.log(d);
		var song = document.getElementById(d);
		song.style.display = "block";

		var nodes = that.reverseTrackHashLookup(that.mediaHash[d]);

		while(nodes.length > 0) {
		    var id = nodes.pop();

		    if (that.mediaHash[id].directory) {

			var div = document.getElementById(id);
			div.parentNode.style.display = "block";
			div.children[0].click();
		    } else
			div.style.display = "block";
		}
	    });	    

	    
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
	    });

	    
	} else {
	    //if we are streaming, get audio file path to add to local web player
	    that.apiCall("/api/files/" + songEntry.id, "GET", true, function(resp) {

		var trackData = JSON.parse(resp);
		that.audioDiv.src =   trackData.path + "/" + trackData.name;
		that.audioDiv.play();

		var seekHandler = function(audio) {
		    that.audioDiv.removeEventListener('canplay', seekHandler);
		    console.log("CAN PLAY THROUGH EVENT");
		    audio.target.currentTime = offset;
		    
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
	    document.getElementById("curInfo-artist").innerHTML = data.artist;
	    document.getElementById("curInfo-title").innerHTML = data.title;
	    document.getElementById("curInfo-album").innerHTML = data.album;
	    that.curTimeOffset = data.pos;

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
