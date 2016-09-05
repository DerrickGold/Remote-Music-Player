MediaButtons = function(evtSys, mediaLibrary) {

    var thisClass = this;
    this.mediaLibrary = mediaLibrary;
    this.currentState = null;
    this.evtSys = evtSys;
    
    var updatePlayPauseBtn = function(newState) {
	thisClass.currentState = newState;
	
	var icon = document.getElementById("media-btn-play-icon");
	if (newState == PlayBackStates["PAUSED"] || newState == PlayBackStates["STOPPED"]) {
	    icon.classList.remove('glyphicon-pause');
	    icon.classList.add('glyphicon-play');
	} else {
	    icon.classList.remove('glyphicon-play');
	    icon.classList.add('glyphicon-pause');
	}

    }
    
    var playPauseBtn = document.getElementById("media-btn-play");
    playPauseBtn.onclick = function() {

	if (!thisClass.mediaLibrary.curTrackInfo) {
	    var track = thisClass.mediaLibrary.getRandomTrack();
	    thisClass.mediaLibrary.playSong(track, 0);
	    return;
	}
	
	if (thisClass.currentState == PlayBackStates["PAUSED"] ||
	    thisClass.currentState == PlayBackStates["STOPPED"])
	    thisClass.mediaLibrary.unpauseSong();
	else
	    thisClass.mediaLibrary.pauseSong();	
    }

/*    var speakerBtn = document.getElementById("media-btn-speaker");
    speakerBtn.onclick = function() {
	thisClass.mediaLibrary.swapOutput();
    }
*/
    var nowPlayingBtn = document.getElementById("media-btn-exit");
    nowPlayingBtn.onclick = function() {
	thisClass.mediaLibrary.toggleNowPlaying(false);
    }

    var nextBtn = document.getElementById("media-btn-next");
    nextBtn.onclick = function() {
	thisClass.mediaLibrary.nextSong();
    }

    var prevBtn = document.getElementById("media-btn-prev");
    prevBtn.onclick = function() {
	thisClass.mediaLibrary.prevSong();
    }

    var shuffleBtn = document.getElementById("media-btn-shuffle");
    shuffleBtn.onclick = function() {
	thisClass.mediaLibrary.shuffle = !thisClass.mediaLibrary.shuffle;
	shuffleBtn.classList.toggle("active");
    }
    var searchBtn = document.getElementById("search-btn");
    searchBtn.onclick = function(e) {
	e.preventDefault();
	var searchKey = document.getElementById("search-txt").value;
	if (searchKey.length > 0)
	    thisClass.mediaLibrary.showSearch(searchKey);
	else
	    thisClass.mediaLibrary.clearSearch();
    }

    var clearSearchBtn = document.getElementById("search-btn-clear");
    clearSearchBtn.onclick = function(e) {
	e.preventDefault();
	var searchBox = document.getElementById("search-txt");
	searchBox.value = "";
	thisClass.mediaLibrary.clearSearch();
    }
    
    this.evtSys.addEventListener('media state change', updatePlayPauseBtn);
}
