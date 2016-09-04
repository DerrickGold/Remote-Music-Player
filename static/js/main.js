var params = queryStringToObject(location.search);
var Media;
var MediaControls;

document.addEventListener("DOMContentLoaded", function () {
  var reactor = new Reactor();
	var gloader = document.querySelector('[role="global-loader"]')
  reactor.registerEvent("loading");
  reactor.addEventListener("loading", function() {
    console.log("LOADING EVENT");
		gloader.classList.add('active');
  });

  reactor.registerEvent("loading done");
  reactor.addEventListener("loading done", function() {
    console.log("LOADING DONE");
		gloader.classList.remove('active')
  });

  Media = new MusicLibrary(reactor, !!params.stream);
  MediaControls = new MediaButtons(reactor, Media);
});

function queryStringToObject (str) {
  var obj = {}
  if (!str) return obj
  if (str[0] == "?") str = str.substr(1)
  var arr = str.split("&")
  arr.forEach(function (el) {
    var a = el.split("=")
    obj[decodeURIComponent(a[0])] = decodeURIComponent(a[1])
  })
  return obj
}
