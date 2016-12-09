'use strict';

/*
 Generic  Canvas Overlay for leaflet, 
 Stanislav Sumbera, April , 2014

 - added userDrawFunc that is called when Canvas need to be redrawn
 - added few useful params fro userDrawFunc callback
 - fixed resize map bug
 inspired & portions taken from  :   https://github.com/Leaflet/Leaflet.heat

 License: MIT

 */

L.CanvasOverlay = L.Class.extend({

	initialize: function initialize(userDrawFunc, options) {
		this._userDrawFunc = userDrawFunc;
		L.setOptions(this, options);
	},

	drawing: function drawing(userDrawFunc) {
		this._userDrawFunc = userDrawFunc;
		return this;
	},

	params: function params(options) {
		L.setOptions(this, options);
		return this;
	},

	canvas: function canvas() {
		return this._canvas;
	},

	redraw: function redraw() {
		if (!this._frame) {
			this._frame = L.Util.requestAnimFrame(this._redraw, this);
		}
		return this;
	},

	onAdd: function onAdd(map) {
		this._map = map;
		this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer');

		var size = this._map.getSize();
		this._canvas.width = size.x;
		this._canvas.height = size.y;

		var animated = this._map.options.zoomAnimation && L.Browser.any3d;
		L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

		map._panes.overlayPane.appendChild(this._canvas);

		map.on('moveend', this._reset, this);
		map.on('resize', this._resize, this);

		if (map.options.zoomAnimation && L.Browser.any3d) {
			map.on('zoomanim', this._animateZoom, this);
		}

		this._reset();
	},

	onRemove: function onRemove(map) {
		map.getPanes().overlayPane.removeChild(this._canvas);

		map.off('moveend', this._reset, this);
		map.off('resize', this._resize, this);

		if (map.options.zoomAnimation) {
			map.off('zoomanim', this._animateZoom, this);
		}
		var this_canvas = null;
	},

	addTo: function addTo(map) {
		map.addLayer(this);
		return this;
	},

	_resize: function _resize(resizeEvent) {
		this._canvas.width = resizeEvent.newSize.x;
		this._canvas.height = resizeEvent.newSize.y;
	},
	_reset: function _reset() {
		var topLeft = this._map.containerPointToLayerPoint([0, 0]);
		L.DomUtil.setPosition(this._canvas, topLeft);
		this._redraw();
	},

	_redraw: function _redraw() {
		var size = this._map.getSize();
		var bounds = this._map.getBounds();
		var zoomScale = size.x * 180 / (20037508.34 * (bounds.getEast() - bounds.getWest())); // resolution = 1/zoomScale
		var zoom = this._map.getZoom();

		// console.time('process');

		if (this._userDrawFunc) {
			this._userDrawFunc(this, {
				canvas: this._canvas,
				bounds: bounds,
				size: size,
				zoomScale: zoomScale,
				zoom: zoom,
				options: this.options
			});
		}

		// console.timeEnd('process');

		this._frame = null;
	},

	_animateZoom: function _animateZoom(e) {
		var scale = this._map.getZoomScale(e.zoom),
		    offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

		this._canvas.style[L.DomUtil.TRANSFORM] = L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ')';
	}
});

L.canvasOverlay = function (userDrawFunc, options) {
	return new L.CanvasOverlay(userDrawFunc, options);
};

/*  Global class for simulating the movement of particle through a 1km wind grid

 credit: All the credit for this work goes to: https://github.com/cambecc for creating the repo:
 https://github.com/cambecc/earth. The majority of this code is directly take nfrom there, since its awesome.

 This class takes a canvas element and an array of data (1km GFS from http://www.emc.ncep.noaa.gov/index.php?branch=GFS)
 and then uses a mercator (forward/reverse) projection to correctly map wind vectors in "map space".

 The "start" method takes the bounds of the map at its current extent and starts the whole gridding,
 interpolation and animation process.
 */

var Windy = function Windy(params) {

	var VELOCITY_SCALE = 0.005 * (Math.pow(window.devicePixelRatio, 1 / 3) || 1); // scale for wind velocity (completely arbitrary--this value looks nice)
	var MIN_TEMPERATURE_K = 261.15; // step size of particle intensity color scale
	var MAX_TEMPERATURE_K = 317.15; // wind velocity at which particle intensity is maximum (m/s)
	var MAX_PARTICLE_AGE = 90; // max number of frames a particle is drawn before regeneration
	var PARTICLE_LINE_WIDTH = 1; // line width of a drawn particle
	var PARTICLE_MULTIPLIER = 1 / 200; // particle count scalar (completely arbitrary--this values looks nice)
	var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6; // multiply particle count for mobiles by this amount
	var FRAME_RATE = 15,
	    FRAME_TIME = 1000 / FRAME_RATE; // desired frames per second

	var NULL_WIND_VECTOR = [NaN, NaN, null]; // singleton for no wind in the form: [u, v, magnitude]

	var builder;
	var grid;
	var date;
	var λ0, φ0, Δλ, Δφ, ni, nj;

	// interpolation for vectors like wind (u,v,m)
	var bilinearInterpolateVector = function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
		var rx = 1 - x;
		var ry = 1 - y;
		var a = rx * ry,
		    b = x * ry,
		    c = rx * y,
		    d = x * y;
		var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
		var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
		var tmp = g00[2] * a + g10[2] * b + g01[2] * c + g11[2] * d;
		return [u, v, tmp];
	};

	var createWindBuilder = function createWindBuilder(uComp, vComp, temp) {
		var uData = uComp.data,
		    vData = vComp.data;
		return {
			header: uComp.header,
			//recipe: recipeFor("wind-" + uComp.header.surface1Value),
			data: function data(i) {
				return [uData[i], vData[i], temp.data[i]];
			},
			interpolate: bilinearInterpolateVector
		};
	};

	var createBuilder = function createBuilder(data) {
		var uComp = null,
		    vComp = null,
		    temp = null,
		    scalar = null;

		data.forEach(function (record) {
			switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
				case "2,2":
					uComp = record;break;
				case "2,3":
					vComp = record;break;
				case "0,0":
					temp = record;break;
				default:
					scalar = record;
			}
		});

		return createWindBuilder(uComp, vComp, temp);
	};

	var buildGrid = function buildGrid(data, callback) {

		builder = createBuilder(data);
		var header = builder.header;

		λ0 = header.lo1;
		φ0 = header.la1; // the grid's origin (e.g., 0.0E, 90.0N)

		Δλ = header.dx;
		Δφ = header.dy; // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)

		ni = header.nx;
		nj = header.ny; // number of grid points W-E and N-S (e.g., 144 x 73)

		date = new Date(header.refTime);
		date.setHours(date.getHours() + header.forecastTime);

		// Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
		// http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
		grid = [];
		var p = 0;
		var isContinuous = Math.floor(ni * Δλ) >= 360;

		for (var j = 0; j < nj; j++) {
			var row = [];
			for (var i = 0; i < ni; i++, p++) {
				row[i] = builder.data(p);
			}
			if (isContinuous) {
				// For wrapped grids, duplicate first column as last column to simplify interpolation logic
				row.push(row[0]);
			}
			grid[j] = row;
		}

		callback({
			date: date,
			interpolate: interpolate
		});
	};

	/**
  * Get interpolated grid value from Lon/Lat position
  * @param λ {Float} Longitude
  * @param φ {Float} Latitude
  * @returns {null}
  */
	var interpolate = function interpolate(λ, φ) {
		var i = floorMod(λ - λ0, 360) / Δλ; // calculate longitude index in wrapped range [0, 360)
		var j = (φ0 - φ) / Δφ; // calculate latitude index in direction +90 to -90

		var fi = Math.floor(i),
		    ci = fi + 1;
		var fj = Math.floor(j),
		    cj = fj + 1;

		var row;
		if (row = grid[fj]) {
			var g00 = row[fi];
			var g10 = row[ci];
			if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
				var g01 = row[fi];
				var g11 = row[ci];
				if (isValue(g01) && isValue(g11)) {
					// All four points found, so interpolate the value.
					return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
				}
			}
		}
		return null;
	};

	/**
  * @returns {Boolean} true if the specified value is not null and not undefined.
  */
	var isValue = function isValue(x) {
		return x !== null && x !== undefined;
	};

	/**
  * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
  *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
  */
	var floorMod = function floorMod(a, n) {
		return a - n * Math.floor(a / n);
	};

	/**
  * @returns {Number} the value x clamped to the range [low, high].
  */
	var clamp = function clamp(x, range) {
		return Math.max(range[0], Math.min(x, range[1]));
	};

	/**
  * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
  */
	var isMobile = function isMobile() {
		return (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent)
		);
	};

	/**
  * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
  * vector is modified in place and returned by this function.
  */
	var distort = function distort(projection, λ, φ, x, y, scale, wind, windy) {
		var u = wind[0] * scale;
		var v = wind[1] * scale;
		var d = distortion(projection, λ, φ, x, y, windy);

		// Scale distortion vectors by u and v, then add.
		wind[0] = d[0] * u + d[2] * v;
		wind[1] = d[1] * u + d[3] * v;
		return wind;
	};

	var distortion = function distortion(projection, λ, φ, x, y, windy) {
		var τ = 2 * Math.PI;
		var H = Math.pow(10, -5.2);
		var hλ = λ < 0 ? H : -H;
		var hφ = φ < 0 ? H : -H;

		var pλ = project(φ, λ + hλ, windy);
		var pφ = project(φ + hφ, λ, windy);

		// Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1º λ
		// changes depending on φ. Without this, there is a pinching effect at the poles.
		var k = Math.cos(φ / 360 * τ);
		return [(pλ[0] - x) / hλ / k, (pλ[1] - y) / hλ / k, (pφ[0] - x) / hφ, (pφ[1] - y) / hφ];
	};

	var createField = function createField(columns, bounds, callback) {

		/**
   * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
   *          is undefined at that point.
   */
		function field(x, y) {
			if (!columns) return [NaN, NaN, null];
			var column = columns[Math.round(x)];
			return column && column[Math.round(y)] || NULL_WIND_VECTOR;
		}

		// Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
		// field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
		field.release = function () {
			//delete columns;
			columns = [];
		};

		field.randomize = function (o) {
			// UNDONE: this method is terrible
			var x, y;
			var safetyNet = 0;
			do {
				x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
				y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y);
			} while (field(x, y)[2] === null && safetyNet++ < 30);
			o.x = x;
			o.y = y;
			return o;
		};

		//field.overlay = mask.imageData;
		//return field;
		callback(bounds, field);
	};

	var buildBounds = function buildBounds(bounds, width, height) {
		var upperLeft = bounds[0];
		var lowerRight = bounds[1];
		var x = Math.round(upperLeft[0]); //Math.max(Math.floor(upperLeft[0], 0), 0);
		var y = Math.max(Math.floor(upperLeft[1], 0), 0);
		var xMax = Math.min(Math.ceil(lowerRight[0], width), width - 1);
		var yMax = Math.min(Math.ceil(lowerRight[1], height), height - 1);
		return { x: x, y: y, xMax: width, yMax: yMax, width: width, height: height };
	};

	var deg2rad = function deg2rad(deg) {
		return deg / 180 * Math.PI;
	};

	var rad2deg = function rad2deg(ang) {
		return ang / (Math.PI / 180.0);
	};

	var invert = function invert(x, y, windy) {
		var mapLonDelta = windy.east - windy.west;
		var worldMapRadius = windy.width / rad2deg(mapLonDelta) * 360 / (2 * Math.PI);
		var mapOffsetY = worldMapRadius / 2 * Math.log((1 + Math.sin(windy.south)) / (1 - Math.sin(windy.south)));
		var equatorY = windy.height + mapOffsetY;
		var a = (equatorY - y) / worldMapRadius;

		var lat = 180 / Math.PI * (2 * Math.atan(Math.exp(a)) - Math.PI / 2);
		var lon = rad2deg(windy.west) + x / windy.width * rad2deg(mapLonDelta);
		return [lon, lat];
	};

	var mercY = function mercY(lat) {
		return Math.log(Math.tan(lat / 2 + Math.PI / 4));
	};

	var project = function project(lat, lon, windy) {
		// both in radians, use deg2rad if neccessary
		var ymin = mercY(windy.south);
		var ymax = mercY(windy.north);
		var xFactor = windy.width / (windy.east - windy.west);
		var yFactor = windy.height / (ymax - ymin);

		var y = mercY(deg2rad(lat));
		var x = (deg2rad(lon) - windy.west) * xFactor;
		var y = (ymax - y) * yFactor; // y points south
		return [x, y];
	};

	var interpolateField = function interpolateField(grid, bounds, extent, callback) {

		var projection = {};

		var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
		var velocityScale = VELOCITY_SCALE * Math.pow(mapArea, 0.3);

		var columns = [];
		var x = bounds.x;

		function interpolateColumn(x) {
			var column = [];
			for (var y = bounds.y; y <= bounds.yMax; y += 2) {
				var coord = invert(x, y, extent);
				if (coord) {
					var λ = coord[0],
					    φ = coord[1];
					if (isFinite(λ)) {
						var wind = grid.interpolate(λ, φ);
						if (wind) {
							wind = distort(projection, λ, φ, x, y, velocityScale, wind, extent);
							column[y + 1] = column[y] = wind;
						}
					}
				}
			}
			columns[x + 1] = columns[x] = column;
		}

		//(function batchInterpolate() {
		//    var start = Date.now();
		//    while (x < bounds.width) {
		//        interpolateColumn(x);
		//        x += 2;
		//        if ((Date.now() - start) > 1000) { //MAX_TASK_TIME) {
		//            setTimeout(batchInterpolate, 25);
		//            return;
		//        }
		//    }
		//    createField(columns, bounds, callback);
		//})();

		for (; x < bounds.width; x += 2) {
			interpolateColumn(x);
		}
		createField(columns, bounds, callback);
	};

	var particles, animationLoop;
	var animate = function animate(bounds, field, extent) {

		function asColorStyle(r, g, b, a) {
			return "rgba(" + 243 + ", " + 243 + ", " + 238 + ", " + a + ")";
		}

		function hexToR(h) {
			return parseInt(cutHex(h).substring(0, 2), 16);
		}
		function hexToG(h) {
			return parseInt(cutHex(h).substring(2, 4), 16);
		}
		function hexToB(h) {
			return parseInt(cutHex(h).substring(4, 6), 16);
		}
		function cutHex(h) {
			return h.charAt(0) == "#" ? h.substring(1, 7) : h;
		}

		function windTemperatureColorScale(minTemp, maxTemp) {

			var result = ["rgb(36,104, 180)", "rgb(60,157, 194)", "rgb(128,205,193 )", "rgb(151,218,168 )", "rgb(198,231,181)", "rgb(238,247,217)", "rgb(255,238,159)", "rgb(252,217,125)", "rgb(255,182,100)", "rgb(252,150,75)", "rgb(250,112,52)", "rgb(245,64,32)", "rgb(237,45,28)", "rgb(220,24,32)", "rgb(180,0,35)"];
			result.indexFor = function (m) {
				// map wind speed to a style
				return Math.max(0, Math.min(result.length - 1, Math.round((m - minTemp) / (maxTemp - minTemp) * (result.length - 1))));
			};
			return result;
		}

		var colorStyles = windTemperatureColorScale(MIN_TEMPERATURE_K, MAX_TEMPERATURE_K);
		var buckets = colorStyles.map(function () {
			return [];
		});
		var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
		var particleCount = Math.round(bounds.width * bounds.height * PARTICLE_MULTIPLIER * Math.pow(mapArea, 0.24));
		if (isMobile()) {
			particleCount /= PARTICLE_REDUCTION;
		}

		particles = particles || [];
		if (particles.length > particleCount) particles = particles.slice(0, particleCount);
		for (var i = particles.length; i < particleCount; i++) {
			particles.push(field.randomize({ age: ~~(Math.random() * MAX_PARTICLE_AGE) + 0 }));
		}

		function evolve() {
			buckets.forEach(function (bucket) {
				bucket.length = 0;
			});
			particles.forEach(function (particle) {
				if (particle.age > MAX_PARTICLE_AGE) {
					field.randomize(particle).age = ~~(Math.random() * MAX_PARTICLE_AGE / 2);
				}
				var x = particle.x;
				var y = particle.y;
				var v = field(x, y); // vector at current position
				var m = v[2];
				if (m === null) {
					particle.age = MAX_PARTICLE_AGE; // particle has escaped the grid, never to return...
				} else {
					var xt = x + v[0];
					var yt = y + v[1];
					if (field(xt, yt)[0] !== null) {
						// Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
						particle.xt = xt;
						particle.yt = yt;
						buckets[colorStyles.indexFor(m)].push(particle);
					} else {
						// Particle isn't visible, but it still moves through the field.
						particle.x = xt;
						particle.y = yt;
					}
				}
				particle.age += 1;
			});
		}

		var g = params.canvas.getContext("2d");
		g.lineWidth = PARTICLE_LINE_WIDTH;

		function draw() {
			// Fade existing particle trails.
			g.save();
			g.globalAlpha = .16;
			g.globalCompositeOperation = 'destination-out';
			g.fillStyle = '#000';
			g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
			g.restore();

			// Draw new particle trails.
			buckets.forEach(function (bucket, i) {
				if (bucket.length > 0) {
					g.beginPath();
					g.strokeStyle = colorStyles[i];
					bucket.forEach(function (particle) {
						g.moveTo(particle.x, particle.y);
						g.lineTo(particle.xt, particle.yt);
						particle.x = particle.xt;
						particle.y = particle.yt;
					});
					g.stroke();
				}
			});
		}

		var then = Date.now();
		(function frame() {
			animationLoop = requestAnimationFrame(frame);
			var now = Date.now();
			var delta = now - then;
			if (delta > FRAME_TIME) {
				then = now - delta % FRAME_TIME;
				evolve();
				draw();
			}
		})();
	};

	var updateData = function updateData(data, bounds, width, height, extent) {
		delete params.data;
		params.data = data;
		if (extent) start(bounds, width, height, extent);
	};

	var start = function start(bounds, width, height, extent) {
		var mapBounds = {
			south: deg2rad(extent[0][1]),
			north: deg2rad(extent[1][1]),
			east: deg2rad(extent[1][0]),
			west: deg2rad(extent[0][0]),
			width: width,
			height: height
		};
		stop();
		// build grid
		buildGrid(params.data, function (grid) {
			// interpolateField
			interpolateField(grid, buildBounds(bounds, width, height), mapBounds, function (bounds, field) {
				// animate the canvas with random points
				windy.field = field;
				animate(bounds, field, mapBounds);
			});
		});
	};

	var stop = function stop() {
		if (windy.field) windy.field.release();
		if (animationLoop) cancelAnimationFrame(animationLoop);
	};

	var shift = function shift(dx, dy) {
		var canvas = params.canvas,
		    w = canvas.width,
		    h = canvas.height,
		    ctx = canvas.getContext("2d");
		if (w > dx && h > dy) {
			var clamp = function clamp(high, value) {
				return Math.max(0, Math.min(high, value));
			};
			var imageData = ctx.getImageData(clamp(w, -dx), clamp(h, -dy), clamp(w, w - dx), clamp(h, h - dy));
			ctx.clearRect(0, 0, w, h);
			ctx.putImageData(imageData, clamp(w, dx), clamp(h, dy));
			for (var i = 0, pLength = particles.length; i < pLength; i++) {
				particles[i].x += dx;
				particles[i].y += dy;
			}
		}
	};

	var windy = {
		params: params,
		start: start,
		stop: stop,
		update: updateData,
		shift: shift,
		createField: createField,
		interpolatePoint: interpolate
	};

	return windy;
};

// shim layer with setTimeout fallback
window.requestAnimationFrame = function () {
	return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback) {
		return window.setTimeout(callback, 1000 / FRAME_RATE);
	};
}();

if (!window.cancelAnimationFrame) {
	window.cancelAnimationFrame = function (id) {
		clearTimeout(id);
	};
}
L.Control.WindPosition = L.Control.extend({

	options: {
		position: 'bottomleft',
		emptyString: 'Unavailable'
	},

	onAdd: function onAdd(map) {
		this._container = L.DomUtil.create('div', 'leaflet-control-wind-position');
		L.DomEvent.disableClickPropagation(this._container);
		map.on('mousemove', this._onMouseMove, this);
		this._container.innerHTML = this.options.emptyString;
		return this._container;
	},

	onRemove: function onRemove(map) {
		map.off('mousemove', this._onMouseMove, this);
	},

	vectorToSpeed: function vectorToSpeed(uMs, vMs) {
		var windAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));
		return windAbs;
	},

	vectorToDegrees: function vectorToDegrees(uMs, vMs) {
		var windAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));
		var windDirTrigTo = Math.atan2(uMs / windAbs, vMs / windAbs);
		var windDirTrigToDegrees = windDirTrigTo * 180 / Math.PI;
		var windDirTrigFromDegrees = windDirTrigToDegrees + 180;
		return windDirTrigFromDegrees.toFixed(3);
	},

	_onMouseMove: function _onMouseMove(e) {

		var self = this;
		var pos = WindJSHelper.map.containerPointToLatLng(L.point(e.containerPoint.x, e.containerPoint.y));
		var gridValue = WindJSHelper.windy.interpolatePoint(pos.lng, pos.lat);
		var htmlOut = "";

		if (gridValue && !isNaN(gridValue[0]) && !isNaN(gridValue[1]) && gridValue[2]) {

			// vMs comes out upside-down..
			var vMs = gridValue[1];
			vMs = vMs > 0 ? vMs = vMs - vMs * 2 : Math.abs(vMs);

			htmlOut = "<strong>Wind Direction: </strong>" + self.vectorToDegrees(gridValue[0], vMs) + "°" + ", <strong>Wind Speed: </strong>" + self.vectorToSpeed(gridValue[0], vMs).toFixed(1) + "m/s" + ", <strong>Temp: </strong>" + (gridValue[2] - 273.15).toFixed(1) + "°C";
		} else {
			htmlOut = "no wind data";
		}

		self._container.innerHTML = htmlOut;

		// move control to bottom row
		if ($('.leaflet-control-wind-position').index() == 0) {
			$('.leaflet-control-wind-position').insertAfter('.leaflet-control-mouseposition');
		}
	}

});

L.Map.mergeOptions({
	positionControl: false
});

L.Map.addInitHook(function () {
	if (this.options.positionControl) {
		this.positionControl = new L.Control.MousePosition();
		this.addControl(this.positionControl);
	}
});

L.control.windPosition = function (options) {
	return new L.Control.WindPosition(options);
};

var WindJSHelper = {

	map: null,
	data: null,
	options: null,
	canvasOverlay: null,
	windy: null,
	context: null,
	timer: null,
	mouseControl: null,

	init: function init(options) {

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

	getRequestUrl: function getRequestUrl() {

		if (!WindJSHelper.options.useNearest) {
			return WindJSHelper.options.latestUrl;
		}

		var params = {
			"timeIso": WindJSHelper.options.timeISO || new Date().toISOString(),
			"searchLimit": WindJSHelper.options.nearestDaysLimit || 7 // don't show data out by more than limit
		};

		return WindJSHelper.options.nearestUrl + $.param(params);
	},

	loadLocalData: function loadLocalData() {

		console.log('using local data..');

		$.getJSON('demo.json', function (data) {
			WindJSHelper.data = data;
			WindJSHelper.initWindy(data);
		});
	},

	loadWindData: function loadWindData() {

		if (WindJSHelper.options.localMode) {
			WindJSHelper.loadLocalData();
			return;
		}

		var request = WindJSHelper.getRequestUrl();
		console.log(request);

		$.ajax({
			type: 'GET',
			url: request,
			data: {
				format: 'json'
			},
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

	redraw: function redraw(overlay, params) {

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


	initWindy: function initWindy(data) {

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

	initMouseHandler: function initMouseHandler() {
		if (!WindJSHelper.mouseControl && WindJSHelper.options.displayValues) {
			WindJSHelper.mouseControl = L.control.windPosition(WindJSHelper.displayOptions || {}).addTo(WindJSHelper.map);
		}
	},

	clearWind: function clearWind() {
		if (WindJSHelper.windy) WindJSHelper.windy.stop();
		if (WindJSHelper.context) WindJSHelper.context.clearRect(0, 0, 3000, 3000);
	},

	destroyWind: function destroyWind() {
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
var WindJSLeaflet = function WindJSLeaflet(options) {

	// don't bother setting up if the service is unavailable
	checkWind(options).then(function () {

		console.log('check wind success');

		WindJSHelper.init(options);
		options.layerControl.addOverlay(WindJSHelper.canvasOverlay, 'wind');
	}).catch(function (err) {
		console.log('check wind failed..');
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
				data: {
					format: 'json'
				},
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