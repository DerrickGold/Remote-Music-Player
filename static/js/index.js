

MusicLibrary = function(doStreaming) {

    var that = this;
    this.mediaDir = null;
    this.indentSize = 10;
    this.audioDiv = null;
    this.streaming = doStreaming;
    
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
		else 
		    that.playSong(f.id);
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
    
    this.playSong = function(id) {

	if (!that.streaming) {
	    //not streaming, tell server to play file
	    xhttp = new XMLHttpRequest();
	    xhttp.open("GET", "/api/files/" + id + "/play");
	    xhttp.send();
	    that.updateTrackInfo();
	} else {
	    //if we are streaming, get audio file path to add to local web player
	    xhttp = new XMLHttpRequest();
	    xhttp.onreadystatechange = function() {
		if (xhttp.readyState == 4 && xhttp.status == 200) {
		    var trackData = JSON.parse(xhttp.responseText);
		    audioDiv.src =  trackData.path + "/" + trackData.name;
		    audioDiv.play();
		}
	    }
	    xhttp.open("GET", "/api/files/" + id);
	    xhttp.send();
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

    
    this.init = function() {
	that.getFiles();

	if (that.streaming) {
	    //if streaming, create the audio player on the page
	    audioDiv = document.createElement("AUDIO");
	    document.body.appendChild(audioDiv);
	}
    }

    this.init();
}
