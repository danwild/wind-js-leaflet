var WindJSLeaflet = function(options){

	// don't bother setting up if the service is unavailable
    checkWind(options).then(function(){

	    console.log('check wind success');

	    WindJSHelper.init(options);
        options.layerControl.addOverlay(WindJSHelper.canvasOverlay, 'wind');

    }).catch(function(err){
        console.log('check wind failed..');
        options.errorCallback(err);
    });

    /**
     * Ping the test endpoint to check if wind server is available
     *
     * @param options
     * @returns {Promise}
     */
    function checkWind(options){

        return new Promise((resolve, reject) => {

	        if(options.localMode) resolve(true);

            $.ajax({
                type: 'GET',
                url: options.pingUrl,
                data: {
                    format: 'json'
                },
                error: function(err) {
                    reject(err);
                },
                success: function(data) {
                    resolve(data);
                }
            });

        });

    }

};

WindJSLeaflet.prototype.setTime = function(timeIso){
	WindJSHelper.options.timeISO = timeIso;
};




