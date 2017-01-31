var WindJSHelper = {

	map: null,
	data: null,
	options: null,
	canvasOverlay: null,
	windy: null,
	context: null,
	timer: null,
	mouseControl: null,

	init: function(options) {

		// set properties
		this.map = options.map;
		this.options = options;

		// clean up on remove
		options.map.on('overlayremove', function (e) {
			if (e.layer == WindJSHelper.canvasOverlay) {
				WindJSHelper.destroyWind();
			}
		});
	},

	getRequestUrl: function() {

		if(!WindJSHelper.options.useNearest) {
			return WindJSHelper.options.latestUrl;
		}

		var params = {
			"timeIso": WindJSHelper.options.timeISO || new Date().toISOString(),
			"searchLimit": WindJSHelper.options.nearestDaysLimit || 7 // don't show data out by more than limit
		};

		return WindJSHelper.options.nearestUrl + '?' + $.param(params);
	},

	loadLocalData: function() {

		console.log('using local data..');

		$.getJSON('demo.json', function (data) {
			WindJSHelper.data = data;
			WindJSHelper.initWindy(data);
		});
	},

	loadWindData: function() {

		if (WindJSHelper.options.localMode) {
			WindJSHelper.loadLocalData();
			return;
		}

		var request = WindJSHelper.getRequestUrl();
		console.log(request);

		$.ajax({
			type: 'GET',
			url: request,
			error: function error(err) {
				console.log('error loading data');
				WindJSHelper.options.errorCallback(err) || console.log(err);
				WindJSHelper.loadLocalData();
			},
			success: function success(data) {
				WindJSHelper.data = data;
				WindJSHelper.initWindy(data);
			}
		});
	},

	redraw: function(overlay, params) {

		if (!WindJSHelper.windy) {
			WindJSHelper.loadWindData();
			return;
		}

		if (WindJSHelper.timer) clearTimeout(WindJSHelper.timer);

		WindJSHelper.timer = setTimeout(function () {

			var bounds = WindJSHelper.map.getBounds();
			var size = WindJSHelper.map.getSize();

			// bounds, width, height, extent
			WindJSHelper.windy.start([[0, 0], [size.x, size.y]], size.x, size.y, [[bounds._southWest.lng, bounds._southWest.lat], [bounds._northEast.lng, bounds._northEast.lat]]);
		}, 750); // showing wind is delayed
	},


	initWindy: function(data) {

		console.log(data);

		// windy object
		WindJSHelper.windy = new Windy({ canvas: WindJSHelper.canvasOverlay.canvas(), data: data });

		// prepare context global var, start drawing
		WindJSHelper.context = WindJSHelper.canvasOverlay.canvas().getContext('2d');
		WindJSHelper.canvasOverlay.canvas().classList.add("wind-overlay");
		WindJSHelper.canvasOverlay.redraw();

		WindJSHelper.map.on('dragstart', WindJSHelper.windy.stop);
		WindJSHelper.map.on('zoomstart', WindJSHelper.clearWind);
		WindJSHelper.map.on('resize', WindJSHelper.clearWind);

		this.initMouseHandler();
	},

	initMouseHandler: function() {
		if (!WindJSHelper.mouseControl && WindJSHelper.options.displayValues) {
			WindJSHelper.mouseControl = L.control.windPosition(WindJSHelper.displayOptions || {}).addTo(WindJSHelper.map);
		}
	},

	clearWind: function() {
		if (WindJSHelper.windy) WindJSHelper.windy.stop();
		if (WindJSHelper.context) WindJSHelper.context.clearRect(0, 0, 3000, 3000);
	},

	destroyWind: function() {
		if (WindJSHelper.timer) clearTimeout(WindJSHelper.timer);
		if (WindJSHelper.windy) WindJSHelper.windy.stop();
		if (WindJSHelper.context) WindJSHelper.context.clearRect(0, 0, 3000, 3000);
		if (WindJSHelper.mouseControl) WindJSHelper.map.removeControl(WindJSHelper.mouseControl);
		WindJSHelper.mouseControl = null;
		WindJSHelper.windy = null;
		WindJSHelper.map.removeLayer(WindJSHelper.canvasOverlay);
	}

};

WindJSHelper.canvasOverlay = L.canvasOverlay().drawing(WindJSHelper.redraw);