L.Control.WindPosition = L.Control.extend({

    options: {
        position: 'bottomleft',
        emptyString: 'Unavailable'
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div', 'leaflet-control-wind-position');
        L.DomEvent.disableClickPropagation(this._container);
        map.on('mousemove', this._onMouseMove, this);
        this._container.innerHTML=this.options.emptyString;
        return this._container;
    },

    onRemove: function (map) {
        map.off('mousemove', this._onMouseMove, this)
    },

    vectorToSpeed: function(uMs, vMs){
        var windAbs = Math.sqrt( Math.pow(uMs, 2) + Math.pow(vMs, 2) );
        return windAbs;
    },

    vectorToDegrees: function(uMs, vMs){
        var windAbs = Math.sqrt( Math.pow(uMs, 2) + Math.pow(vMs, 2) );
        var windDirTrigTo = Math.atan2(uMs/windAbs, vMs/windAbs);
        var windDirTrigToDegrees = windDirTrigTo * 180/Math.PI;
        var windDirTrigFromDegrees = windDirTrigToDegrees + 180;
        return windDirTrigFromDegrees.toFixed(3);
    },

    _onMouseMove: function (e) {

        var self = this;
	    var pos = this.options.WindJSLeaflet._map.containerPointToLatLng(L.point(e.containerPoint.x, e.containerPoint.y));
	    var gridValue = this.options.WindJSLeaflet._windy.interpolatePoint(pos.lng, pos.lat);
	    var htmlOut = "";

	    if(gridValue && !isNaN(gridValue[0]) && !isNaN(gridValue[1]) && gridValue[2]){

		    // vMs comes out upside-down..
		    var vMs = gridValue[1];
		    vMs = (vMs > 0) ? vMs = vMs - (vMs * 2) : Math.abs(vMs);

		    htmlOut =
			    "<strong>Wind Direction: </strong>"+  self.vectorToDegrees(gridValue[0], vMs) + "°" +
			    ", <strong>Wind Speed: </strong>" + self.vectorToSpeed(gridValue[0],vMs).toFixed(1) + "m/s" +
			    ", <strong>Temp: </strong>"+ (gridValue[2] - 273.15).toFixed(1)  + "°C";
	    }
	    else {
		    htmlOut = "no wind data";
	    }

	    self._container.innerHTML = htmlOut;

        // move control to bottom row
        if($('.leaflet-control-wind-position').index() == 0){
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
