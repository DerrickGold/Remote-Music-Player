var Media, MediaControls;

document.addEventListener("DOMContentLoaded", function() {
  var reactor = new Reactor();
  reactor.registerEvent("loading");
  reactor.addEventListener("loading", function() {
    var loadingScreen = document.querySelector('[role="load-screen"]');
    loadingScreen.classList.add("visible");
  });

  reactor.registerEvent("loading done");
  reactor.addEventListener("loading done", function() {
    var loadingScreen = document.querySelector('[role="load-screen"]');
    loadingScreen.classList.remove("visible");
  });
  
  Media         = new MusicLibrary(reactor, true);
  MediaControls = new MediaButtons(reactor, Media);
});
