dist/ot-min.js: lib/operational-transformation.js lib/client.js
	cat lib/operational-transformation.js lib/client.js | uglifyjs -nc > dist/ot-min.js