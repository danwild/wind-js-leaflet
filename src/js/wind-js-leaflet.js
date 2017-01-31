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

	var WindJSLeaflet = function(options) {

		// don't bother setting up if the service is unavailable
		checkWind(options).then(function() {
			WindJSHelper.init(options);
			options.layerControl.addOverlay(WindJSHelper.canvasOverlay, 'wind');

		}).catch(function (err) {
			options.errorCallback(err);
		});

		/**
		 * Ping the test endpoint to check if wind server is available
		 *
		 * @param options
		 * @returns {Promise}
		 */
		function checkWind(options) {

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
		}
	};

	WindJSLeaflet.prototype.setTime = function (timeIso) {
		WindJSHelper.options.timeISO = timeIso;
	};

	return WindJSLeaflet;

}));