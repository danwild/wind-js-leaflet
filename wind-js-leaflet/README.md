# wind-js-leaflet
A plugin for Leaflet to add visualisation overlay of wind direction and velocity, and temperature.
To use this plugin, you will need to run your own [wind-js-server](https://github.com/danwild/wind-js-server) instance.
The data is 1 degree, 6 hourly data from [NOAA](http://nomads.ncep.noaa.gov/).

## Install

### Basic
Download zip and include `dist/wind-js-leaflet.js` and `dist/wind-js-leaflet.css` files using resource tags.

### npm
`npm install wind-js-leaflet`

## Use
Demo use here: http://danwild.github.io/wind-js-leaflet/

## Dependencies
Prior to loading `wind-js-leaflet`, you need to load:
- [Leaflet](leafletjs.com)
- [jQuery](https://jquery.com/)

## Options
```
	localMode: true                                     // use a local data file to test before hitting a real wind-js-server
	map: map,                                           // ref to your leaflet Map
	layerControl: layerControl,                         // ref to your leaflet layer control
	useNearest: false,                                  // get nearest data to your ISO time string
	timeISO: null,                                      // your ISO time string, falls back to current time (can also use WindJsLeaflet.setTime(time))
	nearestDaysLimit: 7,                                // the maximum range (±) to look for data 
	displayValues: true,                                // whether or not to add a mouseover control to display values
	displayOptions: {
	   displayPosition: 'bottomleft',                   // leaflet control position
	   displayEmptyString: 'No wind data'               // what to display in mouseover control when no data
	},
	overlayName: 'wind',                                // string to display for the overlay in your layer control
	pingUrl: 'http://144.6.233.100:7000/alive/',        // url to check service availability
	latestUrl: 'http://144.6.233.100:7000/latest/',     // url to get latest data with no required params   
	nearestUrl: 'http://144.6.233.100:7000/nearest/',   // url to get data nearest a specified time ISO
	errorCallback: handleError                          // callback function to get called on error
```

## Reference
`wind-js-leaflet` is possible because of things like:
- [L.CanvasOverlay.js](https://gist.github.com/Sumbera/11114288)
- [grib2json](https://github.com/cambecc/grib2json)
- [earth](https://github.com/cambecc/earth)
- [WindJS](https://github.com/Esri/wind-js)