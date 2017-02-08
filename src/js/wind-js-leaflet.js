(function (root, factory) {
	if (typeof exports === 'object') {

		// CommonJS
		module.exports = factory(require('wind-js-leaflet'));

	} else if (typeof define === 'function' && define.amd) {
		// AMD
		define(['wind-js-leaflet'], function (WindJSLeaflet) {
			return (root.returnExportsGlobal = factory(window));
		});
	} else {
		// Global Variables
		window.WindJSLeaflet = factory(window);
	}
}(this, function (window) {

	'use strict';

	var WindJSLeaflet = {

		_map: null,
		_data: null,
		_options: null,
		_canvasLayer: null,
		_windy: null,
		_context: null,
		_timer: 0,
		_mouseControl: null,
		
		init: function (options) {
			
			// don't bother setting up if the service is unavailable
			WindJSLeaflet._checkWind(options).then(function() {

				// set properties
				WindJSLeaflet._map = options.map;
				WindJSLeaflet._options = options;

				// create canvas, add overlay control
				WindJSLeaflet._canvasLayer = L.canvasLayer().delegate(WindJSLeaflet);
				WindJSLeaflet._options.layerControl.addOverlay(WindJSLeaflet._canvasLayer, options.overlayName || 'wind');

				// ensure clean up on deselect overlay
				WindJSLeaflet._map.on('overlayremove', function (e) {
					if (e.layer == WindJSLeaflet._canvasLayer) {
						WindJSLeaflet._destroyWind();
					}
				});

			}).catch(function(err) {
				console.log('err');
				WindJSLeaflet._options.errorCallback(err);
			});

		},

		setTime: function (timeIso) {
			WindJSLeaflet._options.timeISO = timeIso;
		},

		/*------------------------------------ PRIVATE ------------------------------------------*/

		/**
		 * Ping the test endpoint to check if wind server is available
		 *
		 * @param options
		 * @returns {Promise}
		 */
		_checkWind: function (options) {

			return new Promise(function (resolve, reject) {

				if (options.localMode) resolve(true);

				$.ajax({
					type: 'GET',
					url: options.pingUrl,
					error: function error(err) {
						reject(err);
					},
					success: function success(data) {
						resolve(data);
					}
				});
			});
		},

		_getRequestUrl: function() {

			if(!this._options.useNearest) {
				return this._options.latestUrl;
			}

			var params = {
				"timeIso": this._options.timeISO || new Date().toISOString(),
				"searchLimit": this._options.nearestDaysLimit || 7 // don't show data out by more than limit
			};

			return this._options.nearestUrl + '?' + $.param(params);
		},

		_loadLocalData: function() {

			console.log('using local data..');

			$.getJSON('demo.json', function (data) {
				WindJSLeaflet._data = data;
				WindJSLeaflet._initWindy(data);
			});
		},

		_loadWindData: function() {

			if(this._options.localMode) {
				this._loadLocalData();
				return;
			}

			var request = this._getRequestUrl();
			console.log(request);

			$.ajax({
				type: 'GET',
				url: request,
				error: function error(err) {
					console.log('error loading data');
					WindJSLeaflet._options.errorCallback(err) || console.log(err);
					WindJSLeaflet._loadLocalData();
				},
				success: function success(data) {
					WindJSLeaflet._data = data;
					WindJSLeaflet._initWindy(data);
				}
			});
		},

		onDrawLayer: function(overlay, params) {

			if (!WindJSLeaflet._windy) {
				WindJSLeaflet._loadWindData();
				return;
			}

			if (this._timer) clearTimeout(WindJSLeaflet._timer);

			this._timer = setTimeout(function () {

				var bounds = WindJSLeaflet._map.getBounds();
				var size = WindJSLeaflet._map.getSize();

				// bounds, width, height, extent
				WindJSLeaflet._windy.start(
					[
						[0, 0],
						[size.x, size.y]
					],
					size.x,
					size.y,
					[
						[bounds._southWest.lng, bounds._southWest.lat],
						[bounds._northEast.lng, bounds._northEast.lat]
					]);
			}, 750); // showing wind is delayed
		},

		_initWindy: function(data) {

			// windy object
			this._windy = new Windy({ canvas: WindJSLeaflet._canvasLayer._canvas, data: data });

			// prepare context global var, start drawing
			this._context = this._canvasLayer._canvas.getContext('2d');
			this._canvasLayer._canvas.classList.add("wind-overlay");
			this.onDrawLayer();

			this._map.on('dragstart', WindJSLeaflet._windy.stop);
			this._map.on('zoomstart', WindJSLeaflet._clearWind);
			this._map.on('resize', WindJSLeaflet._clearWind);

			this._initMouseHandler();
		},

		_initMouseHandler: function() {
			if (!this._mouseControl && this._options.displayValues) {
				var options = this._options.displayOptions || {};
				options['WindJSLeaflet'] = WindJSLeaflet;
				this._mouseControl = L.control.windPosition(options).addTo(this._map);
			}
		},

		_clearWind: function() {
			if (this._windy) this._windy.stop();
			if (this._context) this._context.clearRect(0, 0, 3000, 3000);
		},

		_destroyWind: function() {
			if (this._timer) clearTimeout(this._timer);
			if (this._windy) this._windy.stop();
			if (this._context) this._context.clearRect(0, 0, 3000, 3000);
			if (this._mouseControl) this._map.removeControl(this._mouseControl);
			this._mouseControl = null;
			this._windy = null;
			this._map.removeLayer(this._canvasLayer);
		}
		
	};

	return WindJSLeaflet;

}));