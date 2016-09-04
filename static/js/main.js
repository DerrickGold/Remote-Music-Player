var params = queryStringToObject(location.search);
var gloader; 
var Media;
var MediaControls;

document.addEventListener("DOMContentLoaded", function () {
  var reactor = new Reactor();
	gloader = document.querySelector('[role="global-loader"]')
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
	initWave();
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

function initWave () {
	var path = document.querySelector('#wave');
	var animation = document.querySelector('#moveTheWave');
	var m = 0.5122866232565925;
	function buildWave(w, h) {
		var a = h / 4;
		var y = h / 2;
		var pathData = [
			'M',
			w * 0,
			y + a / 2,
			'c',
			a * m,
			0,
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a,
			's',
			-(1 - a) * m,
			a,
			a,
			a,
			's',
			-(1 - a) * m,
			-a,
			a,
			-a
		].join(' ');
		path.setAttribute('d', pathData);
	}
	buildWave(90, 60);
}
