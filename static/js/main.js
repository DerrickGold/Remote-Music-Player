var Media, MediaControls;

document.addEventListener("DOMContentLoaded", function() {
  var loadingScreen = document.querySelector('[role="load-screen"]');
  var reactor = constructEmitter({});
  reactor.addEventListener("loading", function(e) {
    loadingScreen.classList.add("visible");
  });
  reactor.addEventListener("loading done", function() {
    loadingScreen.classList.remove("visible");
  });
  
  Media         = new MusicLibrary(reactor, true);
  MediaControls = new MediaButtons(reactor, Media);
});

function constructEmitter (obj) {
	var target = document.createDocumentFragment();
	['addEventListener', 'dispatchEvent', 'removeEventListener']
	.forEach(function(method) {
		obj[method] = target[method].bind(target)
	})
  return obj
}
