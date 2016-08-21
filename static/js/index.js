MusicLibrary = function() {

    var that = this;
    this.mediaDir = null;
    this.indentSize = 10;
    

    this.getRootDirDiv = function() {
	return document.getElementById("dirlist");
    }
    
    this.clearDirectoryBrowser = function() {
	var masterListDiv = that.getRootDirDiv();

	while (masterListDiv.firstChild) {
	    masterListDiv.removeChild(masterListDiv.firstChild);
	}
    }

    
    this.displayFolder = function(folder, parentDiv, depth) {

	if (!depth) depth = 0;
	
	folder.children.forEach(function(f) {

	    var folderDiv = document.createElement("div");

	    folderDiv.innerHTML = f.name;
	    
	    folderDiv.onclick = function() {
		if (f.directory)
		    that.displayFolder(f, folderDiv, depth+1);	    
		else 
		    that.playSong(f.id);
	    };

	    
	    
	    
	    
	    if (f.directory) {
		folderDiv.className = "FolderEntry";

		var folderContent = document.createElement("div");
		folderContent.append(folderDiv);
		folderDiv = folderContent;
	    } else
		folderDiv.className = "FileEntry";

	    folderDiv.style.marginLeft = (that.indentSize * depth) + "px";
	    parentDiv.append(folderDiv);

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
	xhttp = new XMLHttpRequest();
	xhttp.open("GET", "/api/files/" + id + "/play");
	xhttp.send();
    }

    
    this.init = function() {
	that.getFiles();
    }

    this.init();
}
